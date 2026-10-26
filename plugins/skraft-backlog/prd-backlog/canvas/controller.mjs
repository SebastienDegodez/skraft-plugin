// The canvas controller: the backlog in view, the story in focus, the last dry run, and the actions
// the panel and the agent share. Reviewing stories and creating issues are human actions: the agent
// may read, explain, focus and preview, never review or create.
import { EventEmitter } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderHandoffLogs } from '../publish.mjs'
import { assessBacklog, questionStatesOf } from './assess.mjs'
import { reviewedStories, runSelection, selectionKey, selectionOf } from './creation.mjs'
import { explainStory } from './explain.mjs'
import { diagnosticsOf, handoffDir, isSlug, listBacklogs, loadBacklog, readFraming, signatureOf, writeAnswer, writeFramingAnswer, writeCorrections, writePublished, writeRepo, writeReviews } from './store.mjs'
import { acceptedOf, decide, proposeCorrections, withDecisions } from '../corrections.mjs'
import { openQuestionsOf } from '../story.mjs'

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
 * @param {{ cwd: string, gh: import('../publish.mjs').GhRun, now?: () => Date, pollMs?: number,
 *   timers?: { setInterval: (fn: () => void, ms: number) => any, clearInterval: (handle: any) => void } }} options
 */
export const createController = ({ cwd, gh, now = () => new Date(), pollMs = 1500, timers = globalThis }) => {
  const events = new EventEmitter()
  /** @type {{ backlogs: { slug: string, updatedAt: number }[], slug: string | null, raw: any, assessment: any, error: string | null,
   *   focus: string | null, preview: any, result: any, busy: string | null, repo: string | null, signature: string | null }} */
  const state = { backlogs: [], slug: null, raw: null, assessment: null, diagnostics: null, error: null, focus: null, preview: null, result: null, busy: null, repo: null, signature: null }
  const changed = () => events.emit('change')

  const reload = async () => {
    state.backlogs = await listBacklogs(cwd)
    if (!state.slug || !state.backlogs.some((b) => b.slug === state.slug)) state.slug = state.backlogs[0]?.slug ?? null
    if (!state.slug) {
      Object.assign(state, { raw: null, assessment: null, diagnostics: null, error: null, signature: null })
      return
    }
    state.diagnostics = await diagnosticsOf(cwd, state.slug)
    Object.assign(state, await assessed(state.slug, state.diagnostics))
    if (state.focus && !state.assessment?.stories.some((s) => s.id === state.focus)) state.focus = null
    state.signature = await signatureOf(cwd, state.slug)
  }

  /**
   * The assessment of a backlog, or why there is none: no map yet (the run is still before it), a
   * map that cannot be read, or one the assessment trips on. Never a blank panel.
   * @param {string} slug @param {any} diagnostics
   */
  const assessed = async (slug, diagnostics) => {
    if (diagnostics.map.state === 'missing') {
      const run = diagnostics.run
      return { raw: null, assessment: null, error: `${slug}: no story map yet${run ? ` — the run is in ${run.phase} (${run.status})` : ''}` }
    }
    const loaded = await loadBacklog(cwd, slug)
    if ('error' in loaded) return { raw: null, assessment: null, error: loaded.error }
    try {
      return { raw: loaded.raw, assessment: assessBacklog(loaded.raw), error: null }
    } catch (error) {
      return { raw: null, assessment: null, error: `${slug}: the story map cannot be assessed — ${/** @type {Error} */ (error).message}` }
    }
  }

  /**
   * Reloads when a file of the backlog changed since the last read. `live` says whether the watch
   * that started this poll still runs: a poll the watch outlived reads nothing more.
   * @param {() => boolean} [live]
   */
  const poll = async (live = () => true) => {
    const slugs = (await listBacklogs(cwd)).map((b) => b.slug).join(',')
    const signature = state.slug ? await signatureOf(cwd, state.slug) : null
    if (signature === state.signature && slugs === state.backlogs.map((b) => b.slug).join(',')) return false
    if (!live()) return false
    await reload()
    changed()
    return true
  }

  let timer = null
  let watching = 0
  /** @type {Promise<unknown> | null} */
  let inFlight = null
  /** One poll at a time; a tick that finds one under way is skipped. @param {number} watch */
  const tick = (watch) => {
    if (inFlight) return
    inFlight = poll(() => watch === watching).catch(() => false).finally(() => { inFlight = null })
  }
  const watch = () => {
    if (timer) return
    const own = watching
    timer = timers.setInterval(() => tick(own), pollMs)
    timer.unref?.()
  }
  /** Stops the watch; resolves once the poll under way, if any, has settled. */
  const stop = async () => {
    if (timer) timers.clearInterval(timer)
    timer = null
    watching += 1
    await inFlight
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
    backlogs: state.backlogs.map((b) => b.slug), slug: state.slug, error: state.error, focus: state.focus, busy: state.busy, diagnostics: state.diagnostics,
    repo: repoOf(), assessment: state.assessment, preview: state.preview && { ...state.preview, key: undefined }, result: state.result,
  })

  /** A summary small enough for the agent: no story file, only where each story stands. */
  const summary = () => {
    const a = requireBacklog()
    return {
      slug: a.slug, repo: repoOf(), run: a.run, coverage: a.coverage, counts: a.counts, mapProblems: a.mapCheck.problems,
      stories: a.stories.map((s) => ({
        id: s.id, title: s.title, state: s.state, review: s.review, verdict: s.verdict,
        failing: [...Object.entries(s.invest), ...Object.entries(s.dor)].filter(([, line]) => line.status === 'fail').map(([key]) => (/\d/.test(key) ? `DoR ${key}` : key)),
        issue: s.published?.number ?? null, progress: s.progress,
      })),
    }
  }

  /** The story ids of one epic of the backlog in view. @param {unknown} epic */
  const epicIds = (epic) => {
    const found = requireBacklog().epics.find((e) => e.id === epic)
    if (!found) throw new UserError(`${String(epic)} is no epic of this backlog`)
    return /** @type {string[]} */ (found.stories)
  }

  /** @param {string[]} ids */
  const readyOf = (ids) => requireBacklog().stories.filter((s) => ids.includes(s.id) && s.state === 'ready')

  /** The proposals of the backlog in view, computed from its files as they read now. */
  const proposalsOf = () => {
    const assessment = requireBacklog()
    const raw = state.raw
    return proposeCorrections({ map: raw.map, files: raw.files, language: assessment.language, known: new Set((raw.inventory?.requirements ?? []).map((r) => r.id)), reviews: raw.reviews, answers: raw.answers, contents: raw.contents })
  }

  /** @param {import('../corrections.mjs').Corrections} corrections */
  const snapshotOf = (corrections) => Object.fromEntries(withDecisions(proposalsOf(), corrections).map((story) => [story.id, { epic: story.epic, findings: story.findings }]))

  /** @param {unknown} id */
  const correctionTarget = (id) => {
    if (typeof id !== 'string') throw new UserError('id must name a correction option')
    for (const story of proposalsOf()) {
      for (const finding of story.findings) {
        const option = finding.options.find((o) => o.id === id)
        if (option) return { story: story.id, finding, option }
      }
    }
    throw new UserError(`${id} is no correction proposed now`)
  }

  /** @param {string[] | null} ids */
  const correctionView = (ids) => {
    const corrections = state.raw.corrections
    const proposals = withDecisions(proposalsOf(), corrections).filter((s) => !ids || ids.includes(s.id))
    const stories = (ids ?? [...state.raw.files.keys()]).map((id) => ({
      id, questions: questionsOf(id), findings: proposals.find((s) => s.id === id)?.findings ?? [],
    })).filter((s) => s.questions.length || s.findings.length)
    return { stories, session: sessionView() }
  }

  /** Each open question of a story: open, answered in draft, or resolved in the story file. @param {string} id */
  const questionsOf = (id) => questionStatesOf(state.raw.files.get(id)?.openQuestions, state.raw.answers[id])

  /** The framing of the backlog in view: questions, recommendation, answer, and what is left. */
  const framingView = async () => {
    if (!state.slug) throw new UserError('no backlog in this workspace: run the skraft-prd-backlog workflow first')
    const framing = await readFraming(cwd, state.slug)
    if (!framing) return { slug: state.slug, questions: [], open: 0 }
    const questions = framing.questions.map((q) => ({ ...q, answer: framing.answers[q.id]?.text ?? null, answeredAt: framing.answers[q.id]?.at ?? null }))
    return { slug: state.slug, questions, open: questions.filter((q) => q.answer === null).length,
      resume: 'Resume the skraft-prd-backlog workflow: unanswered questions take their recommendation' }
  }

  const sessionView = () => {
    const corrections = requireBacklog() && state.raw.corrections
    const accepted = acceptedOf(corrections)
    const answers = Object.entries(state.raw.answers).flatMap(([id]) => questionsOf(id).filter((q) => q.status === 'draft').map((q) => ({ story: id, question: q.id })))
    return {
      accepted: accepted.map((d) => ({ id: d.option.id, story: d.story, kind: d.option.kind, title: d.option.title, comment: d.comment ?? null, at: d.at })),
      answers, last: corrections.session,
      ready: accepted.length > 0 || answers.length > 0,
      run: 'Run the skraft-prd-backlog workflow with corrections: true',
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
      name: 'list_framing', agent: true,
      description: 'The framing questions asked before the first slice, each with its options, the recommended one and the answer given so far.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => framingView(),
    },
    {
      name: 'answer_framing', agent: false,
      description: 'Answers one framing question (an option or free text); an empty text withdraws the answer. Resume the workflow to slice with the answers.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['id', 'text'], properties: { id: { type: 'string' }, text: { type: 'string' } } },
      run: async ({ id, text }) => exclusive('frame', async () => {
        if (!state.slug) throw new UserError('no backlog in this workspace: run the skraft-prd-backlog workflow first')
        if (typeof id !== 'string' || typeof text !== 'string') throw new UserError('id and text must be strings')
        try {
          await writeFramingAnswer(cwd, state.slug, { id, text, at: now().toISOString() })
        } catch (error) {
          throw new UserError(/** @type {Error} */ (error).message)
        }
        return framingView()
      }),
    },
    {
      name: 'list_corrections', agent: true,
      description: 'The corrections a human can choose for each blocked story: each finding (INVEST letter, DoR item, review finding, open question) with 2 to 4 options, their consequences, impact, source and decision; the open questions with their draft answers; the correction session.',
      inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
      run: async ({ ids } = {}) => correctionView(ids === undefined ? null : storyIds(ids)),
    },
    {
      name: 'decide_correction', agent: false,
      description: 'Accepts or refuses one correction option (proposed withdraws the decision). A custom option needs a comment that describes it.',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['id', 'decision'],
        properties: { id: { type: 'string' }, decision: { type: 'string', enum: ['accepted', 'refused', 'proposed'] }, comment: { type: 'string' } },
      },
      run: async ({ id, decision, comment }) => exclusive('decide', async () => {
        if (!['accepted', 'refused', 'proposed'].includes(decision)) throw new UserError('decision must be accepted, refused or proposed')
        const target = correctionTarget(id)
        let corrections
        try {
          corrections = decide(state.raw.corrections, target, { status: decision, comment: typeof comment === 'string' && comment.trim() ? comment.trim() : undefined, at: now().toISOString() })
        } catch (error) {
          throw new UserError(/** @type {Error} */ (error).message)
        }
        await writeCorrections(cwd, /** @type {string} */ (state.slug), { ...corrections, stories: snapshotOf(corrections) })
        await reload()
        return { id, decision, accepted: acceptedOf(state.raw.corrections).length }
      }),
    },
    {
      name: 'answer_question', agent: false,
      description: 'Records a draft answer to an open question of a story; the story writer folds it in at the next correction session. An empty text withdraws it.',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['story', 'question', 'text'],
        properties: { story: { type: 'string' }, question: { type: 'string' }, text: { type: 'string' } },
      },
      run: async ({ story, question, text }) => exclusive('answer', async () => {
        const [id] = storyIds([story])
        const file = state.raw.files.get(id)
        if (!openQuestionsOf(file?.openQuestions).some((q) => q.id === question)) throw new UserError(`${id} has no open question ${question}`)
        if (typeof text !== 'string') throw new UserError('text must be a string')
        const answers = await writeAnswer(cwd, /** @type {string} */ (state.slug), { story: id, question, text, at: now().toISOString() })
        await reload()
        return { story: id, question, answer: answers[question] ?? null }
      }),
    },
    {
      name: 'get_correction_session', agent: true,
      description: 'The correction session: what is accepted and waits to be applied, and how the last session ended.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => sessionView(),
    },
    {
      name: 'review_epic', agent: false,
      description: 'Marks every ready story of one epic as reviewed by a human, as their files read now; reviewed: false withdraws the marks. The other epics may still be in progress.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['epic'], properties: { epic: { type: 'string' }, reviewed: { type: 'boolean' } } },
      run: async ({ epic, reviewed = true }) => exclusive('review', async () => {
        const stories = readyOf(epicIds(epic))
        if (!stories.length) throw new UserError(`${epic} has no ready story yet`)
        await writeReviews(cwd, /** @type {string} */ (state.slug), stories.map((s) => ({ id: s.id, fingerprint: s.fingerprint })), { reviewed: reviewed !== false, now: now().toISOString() })
        state.preview = null
        await reload()
        return { epic, reviewed: stories.map((s) => s.id), counts: state.assessment.counts }
      }),
    },
    {
      name: 'preview_epic', agent: true,
      description: 'Dry run of the GitHub creation of one epic: its reviewed stories (closed over the stories they wait on) and the epic issue. create_issues then creates exactly that.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['epic'], properties: { epic: { type: 'string' } } },
      run: async ({ epic }) => exclusive('preview', async () => {
        const assessment = requireBacklog()
        const ids = readyOf(epicIds(epic)).filter((s) => s.review === 'reviewed').map((s) => s.id)
        if (!ids.length) throw new UserError(`${epic} has no reviewed ready story: review the epic first`)
        const outcome = await runSelection({ raw: state.raw, assessment, ids, repo: repoOf(), gh, dryRun: true })
        state.preview = { ...outcome, ids, at: now().getTime() }
        state.result = null
        return { epic, ...outcome, key: undefined }
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
