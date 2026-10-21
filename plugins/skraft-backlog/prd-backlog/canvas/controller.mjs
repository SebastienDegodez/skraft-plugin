// The canvas controller: the backlog in view, the story in focus, the last dry run, and the actions
// the panel and the agent share. Reviewing stories and creating issues are human actions: the agent
// may read, explain, focus and preview, never review or create.
import { EventEmitter } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderHandoffLogs } from '../publish.mjs'
import { assessBacklog } from './assess.mjs'
import { reviewedStories, runSelection, selectionKey, selectionOf } from './creation.mjs'
import { explainStory } from './explain.mjs'
import { handoffDir, isSlug, listBacklogs, loadBacklog, signatureOf, writePublished, writeRepo, writeReviews } from './store.mjs'

/** A request the user can correct: a 400, never a crash. */
export class UserError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'UserError'
  }
}

/** How long a dry run stays valid for the creation that follows it. */
export const PREVIEW_TTL_MS = 15 * 60 * 1000

/**
 * @param {{ cwd: string, gh: import('../publish.mjs').GhRun, now?: () => Date, pollMs?: number }} options
 */
export const createController = ({ cwd, gh, now = () => new Date(), pollMs = 1500 }) => {
  const events = new EventEmitter()
  /** @type {{ backlogs: { slug: string, updatedAt: number }[], slug: string | null, raw: any, assessment: any, error: string | null,
   *   focus: string | null, preview: any, result: any, busy: string | null, repo: string | null, signature: string | null }} */
  const state = { backlogs: [], slug: null, raw: null, assessment: null, error: null, focus: null, preview: null, result: null, busy: null, repo: null, signature: null }
  const changed = () => events.emit('change')

  const reload = async () => {
    state.backlogs = await listBacklogs(cwd)
    if (!state.slug || !state.backlogs.some((b) => b.slug === state.slug)) state.slug = state.backlogs[0]?.slug ?? null
    if (!state.slug) {
      Object.assign(state, { raw: null, assessment: null, error: null, signature: null })
      return
    }
    const loaded = await loadBacklog(cwd, state.slug)
    if ('error' in loaded) {
      Object.assign(state, { raw: null, assessment: null, error: loaded.error })
    } else {
      state.raw = loaded.raw
      state.assessment = assessBacklog(loaded.raw)
      state.error = null
      if (state.focus && !state.assessment.stories.some((s) => s.id === state.focus)) state.focus = null
    }
    state.signature = await signatureOf(cwd, state.slug)
  }

  /** Reloads when a file of the backlog changed since the last read. */
  const poll = async () => {
    const slugs = (await listBacklogs(cwd)).map((b) => b.slug).join(',')
    const signature = state.slug ? await signatureOf(cwd, state.slug) : null
    if (signature === state.signature && slugs === state.backlogs.map((b) => b.slug).join(',')) return false
    await reload()
    changed()
    return true
  }

  let timer = null
  const watch = () => {
    if (timer) return
    timer = setInterval(() => void poll().catch(() => {}), pollMs)
    timer.unref?.()
  }
  const stop = () => {
    if (timer) clearInterval(timer)
    timer = null
  }

  const repoOf = () => state.repo ?? state.assessment?.repo ?? null

  const requireBacklog = () => {
    if (!state.assessment) throw new UserError(state.error ?? 'no backlog in this workspace: run the skraft-prd-backlog workflow first')
    return state.assessment
  }

  /** @param {unknown} ids */
  const storyIds = (ids) => {
    if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === 'string')) throw new UserError('ids must list story ids')
    const known = new Set(requireBacklog().stories.map((s) => s.id))
    const unknown = ids.filter((id) => !known.has(id))
    if (unknown.length) throw new UserError(`unknown stories: ${unknown.join(', ')}`)
    return /** @type {string[]} */ (ids)
  }

  /** @param {string} name @param {() => Promise<any>} work */
  const exclusive = async (name, work) => {
    if (state.busy) throw new UserError(`${state.busy} is running`)
    state.busy = name
    changed()
    try {
      return await work()
    } finally {
      state.busy = null
      changed()
    }
  }

  const snapshot = () => ({
    backlogs: state.backlogs.map((b) => b.slug), slug: state.slug, error: state.error, focus: state.focus, busy: state.busy,
    repo: repoOf(), assessment: state.assessment, preview: state.preview && { ...state.preview, key: undefined }, result: state.result,
  })

  /** A summary small enough for the agent: no story file, only where each story stands. */
  const summary = () => {
    const a = requireBacklog()
    return {
      slug: a.slug, repo: repoOf(), coverage: a.coverage, counts: a.counts, mapProblems: a.mapCheck.problems,
      stories: a.stories.map((s) => ({
        id: s.id, title: s.title, state: s.state, review: s.review, verdict: s.verdict,
        failing: [...Object.entries(s.invest), ...Object.entries(s.dor)].filter(([, line]) => line.status === 'fail').map(([key]) => (/\d/.test(key) ? `DoR ${key}` : key)),
        issue: s.published?.number ?? null,
      })),
    }
  }

  const actions = [
    {
      name: 'get_state', agent: true,
      description: 'Where every story of the backlog in view stands: state, human review, INVEST letters and DoR items that fail.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => summary(),
    },
    {
      name: 'open_backlog', agent: true,
      description: 'Shows another backlog of the workspace, by its slug.',
      inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'], additionalProperties: false },
      run: async ({ slug }) => {
        if (!isSlug(slug) || !state.backlogs.some((b) => b.slug === slug)) throw new UserError(`${slug} is no backlog of this workspace`)
        Object.assign(state, { slug, focus: null, preview: null, result: null, repo: null })
        await reload()
        changed()
        return summary()
      },
    },
    {
      name: 'focus_story', agent: true,
      description: 'Opens one story in the panel.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
      run: async ({ id }) => {
        const [story] = storyIds([id])
        state.focus = story
        changed()
        return { focus: story }
      },
    },
    {
      name: 'explain_story', agent: true,
      description: 'Why a story is or is not INVEST and ready (Definition of Ready): each failing letter and item with its evidence.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
      run: async ({ id }) => {
        const [story] = storyIds([id])
        const assessment = requireBacklog()
        return explainStory(/** @type {any} */ (assessment.stories.find((s) => s.id === story)), assessment.language)
      },
    },
    {
      name: 'set_repo', agent: false,
      description: 'Sets the repository the issues are created in (owner/repo).',
      inputSchema: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'], additionalProperties: false },
      run: async ({ repo }) => {
        if (typeof repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new UserError('repo must read owner/repo')
        if (state.slug) await writeRepo(cwd, state.slug, repo)
        Object.assign(state, { repo, preview: null })
        changed()
        return { repo }
      },
    },
    {
      name: 'mark_reviewed', agent: false,
      description: 'Marks stories as reviewed by a human, as their files read now; reviewed: false withdraws the mark.',
      inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, reviewed: { type: 'boolean' } }, required: ['ids'], additionalProperties: false },
      run: async ({ ids, reviewed = true }) => exclusive('review', async () => {
        const assessment = requireBacklog()
        const stories = storyIds(ids).map((id) => assessment.stories.find((s) => s.id === id))
        const unready = stories.filter((s) => reviewed && s.state !== 'ready')
        if (unready.length) throw new UserError(`only ready stories can be reviewed: ${unready.map((s) => `${s.id} is ${s.state}`).join(', ')}`)
        await writeReviews(cwd, /** @type {string} */ (state.slug), stories.map((s) => ({ id: s.id, fingerprint: s.fingerprint })), { reviewed: reviewed !== false, now: now().toISOString() })
        state.preview = null
        await reload()
        return { reviewed: stories.map((s) => s.id), counts: state.assessment.counts }
      }),
    },
    {
      name: 'preview_creation', agent: true,
      description: 'Dry run of the GitHub creation: the issues and links creating these stories (default: every reviewed story) would make, with what already exists.',
      inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
      run: async ({ ids } = {}) => exclusive('preview', async () => {
        const assessment = requireBacklog()
        const asked = ids === undefined ? reviewedStories(assessment) : storyIds(ids)
        const outcome = await runSelection({ raw: state.raw, assessment, ids: asked, repo: repoOf(), gh, dryRun: true })
        state.preview = { ...outcome, ids: asked, at: now().getTime() }
        state.result = null
        return { ...outcome, key: undefined }
      }),
    },
    {
      name: 'create_issues', agent: false,
      description: 'Creates on GitHub the selection of the last dry run, unchanged since.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => exclusive('create', async () => {
        // The files as they read now, not as the last poll read them: an edit since the dry run must refuse.
        await reload()
        const assessment = requireBacklog()
        const preview = state.preview
        if (!preview || preview.status !== 'simulated') throw new UserError('run a dry run of the selection first')
        if (now().getTime() - preview.at > PREVIEW_TTL_MS) throw new UserError('the dry run is older than 15 minutes: run it again')
        if (selectionKey(assessment, selectionOf(assessment, preview.ids), repoOf()) !== preview.key) {
          state.preview = null
          throw new UserError('the selection changed since the dry run: run it again')
        }
        const outcome = await runSelection({ raw: state.raw, assessment, ids: preview.ids, repo: repoOf(), gh, dryRun: false })
        if (outcome.status === 'refused') throw new UserError(outcome.reason)
        await writePublished(cwd, /** @type {string} */ (state.slug), outcome.published)
        const stamp = now().toISOString()
        const dir = handoffDir(cwd, /** @type {string} */ (state.slug))
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, `handoff-logs-canvas-${stamp.replace(/[:.]/g, '-')}.md`), renderHandoffLogs(outcome.report, { slug: /** @type {string} */ (state.slug), now: stamp, dryRun: false }), 'utf8')
        state.preview = null
        state.result = { ...outcome, key: undefined }
        await reload()
        return state.result
      }),
    },
  ]

  return { actions, snapshot, reload, poll, watch, stop, events, state }
}
