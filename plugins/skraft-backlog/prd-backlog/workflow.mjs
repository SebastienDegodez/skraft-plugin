// The `skraft-prd-backlog` dynamic workflow: from an approved PRD to a reviewed GitHub backlog.
//
//   INVENTORY  the PRD's requirement ids, read by a script
//   SLICE      the slicer writes the story map; a script normalizes and checks it; a human
//              approves it (pause)
//   ELABORATE  one story writer per story, in parallel; a script writes the map's fields into each
//              story file and checks it; a shared failure stops the run before any retry
//   REVIEW     the four planning lenses per epic; review-verdict.mjs decides story by story;
//              rework at most twice
//   CORRECT    with args.corrections: the corrections a human accepted in the canvas, applied to the
//              map and the stories they touch; only those stories are written and reviewed again
//   HANDOFF    the HVE planning files; a human checks the review box (pause)
//   PUBLISH    issues, sub-issues, blocked-by links and milestones, idempotent
//
// The workflow decides nothing a script or a human decides: every verdict comes from a check.
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { computeVerdict, parseLensResult } from '../skills/backlog-review-lenses/scripts/review-verdict.mjs'
import { LENSES, lensBrief, sliceBrief, splitBrief, storyBrief } from './briefs.mjs'
import { holdBackDependents, isReviewed, planOperations, planProblems, renderHandoffFiles } from './handoff.mjs'
import { acceptedOf, applyDependency, applyMerge, applySplit, correctionsOf, proposeCorrections, SPLIT_KINDS, splitProblems, withDecisions } from './corrections.mjs'
import { inventoryOf, sha256 } from './prd-inventory.mjs'
import { createGitHub, ghCli, publish, publishedItems, renderHandoffLogs } from './publish.mjs'
import { loadBacklog, writeCorrections, writePublished } from './canvas/store.mjs'
import { renderAcDraft, renderStoriesFile, renderStoryMap, say } from './render.mjs'
import { explanation } from './canvas/ui/i18n.mjs'
import { judgedOnly, storyVerdicts, triageDefects } from './review.mjs'
import { CORRECTION_RULES, checkStory, normalizeStory, openQuestionsOf } from './story.mjs'
import { checkStoryMap, normalizeStoryMap, storiesOf } from './story-map.mjs'

export const MAX_ATTEMPTS = 3

/**
 * The circuit breaker of ELABORATE: when one check refuses at least this share of the first
 * drafts (and at least `min` of them), the cause is the brief, the skill or the schema, not the
 * stories — the run stops before paying for retries.
 */
export const BREAKER = Object.freeze({ share: 0.5, min: 3 })

export const PRD_BACKLOG_META = Object.freeze({
  name: 'skraft-prd-backlog',
  description:
    'Turn an approved PRD into a reviewed GitHub backlog: epics as tracking issues, INVEST stories that pass the ' +
    'Definition of Ready as sub-issues, blocked-by links and milestones. Pauses twice for a human: after the story ' +
    'map, and on the handoff review box. args: { prd: path of the PRD, slug?: kebab-case scope (default: the PRD file ' +
    'name), repo?: owner/repo to publish to (default: the repository of the working directory), epics?: epic ids to ' +
    'elaborate (default: all), approve?: true to skip the story-map pause, dryRun?: true to simulate the publication, ' +
    'corrections?: true to apply the corrections and answers accepted in the backlog canvas, then review only the stories they touch, ' +
    'agentIds?: { [agent file id]: session agent id }, models?: { [agent file id]: Copilot model name } }.',
  phases: Object.freeze(['INVENTORY', 'SLICE', 'CORRECT', 'ELABORATE', 'REVIEW', 'HANDOFF', 'PUBLISH'].map((title) => Object.freeze({ title }))),
  argsSchema: Object.freeze({
    type: 'object',
    required: ['prd'],
    properties: Object.freeze({
      prd: { type: 'string' }, slug: { type: 'string' }, repo: { type: 'string' },
      epics: { type: 'array', items: { type: 'string' } },
      approve: { type: 'boolean' }, dryRun: { type: 'boolean' }, corrections: { type: 'boolean' },
      agentIds: { type: 'object' }, models: { type: 'object' },
    }),
  }),
})

/**
 * @typedef {{
 *   args: Record<string, any>, log: (message: string) => void, phase?: (title: string) => void,
 *   agent: (prompt: string, options: { label: string, agent?: string, model?: string }) => Promise<string | null | undefined>,
 *   step: <T>(key: string, produce: () => T | Promise<T>) => Promise<T>,
 *   parallel: <T>(thunks: Array<() => Promise<T>>) => Promise<Array<T | null>>,
 *   pause: (key: string) => Promise<void>,
 *   session?: { rpc?: { agent?: { list?: (request?: object) => Promise<{ agents?: { id?: string, name?: string, displayName?: string }[] }> } } },
 * }} WorkflowContext
 * @typedef {{ cwd: string, now?: () => string, gh?: import('./publish.mjs').GhRun }} Host
 */

/**
 * @param {WorkflowContext} ctx
 * @param {Host} host
 */
export const runPrdBacklogWorkflow = async (ctx, host) => {
  const run = await prepare(ctx, host)
  if ('status' in run) return run
  ctx.phase?.('SLICE')
  const sliced = await slice(ctx, run)
  if (sliced.problems.length) return blocked(run, 'SLICE', sliced.problems)
  const correcting = ctx.args.corrections === true
  if (ctx.args.approve !== true && !correcting) await ctx.pause('story-map-approved')
  const approved = await approvedMap(ctx, run)
  if (approved.problems.length) return blocked(run, 'SLICE', approved.problems)
  run.map = /** @type {import('./story-map.mjs').StoryMap} */ (approved.map)
  if (unknownEpics(run).length) return outcome(run, 'refused', `args.epics: ${unknownEpics(run).join(', ')} is no epic of the story map`)
  if (correcting) {
    ctx.phase?.('CORRECT')
    const corrected = await correct(ctx, run)
    if ('status' in corrected) return corrected
  }
  ctx.phase?.('ELABORATE')
  const epics = selectedEpics(run)
  await prepareStoriesDir(ctx, run)
  const drafts = await firstDrafts(ctx, run, epics)
  const tripped = run.touched ? null : breakerOf(drafts)
  if (tripped) return outcome(run, 'blocked', tripped.reason, { phase: 'ELABORATE', problems: tripped.problems })
  ctx.phase?.('REVIEW')
  const results = await ctx.parallel(epics.map((epic) => () => elaborateAndReview(ctx, run, epic, drafts)))
  await sweep(ctx, run)
  await writeSliceProposals(ctx, run, results)
  await snapshotCorrections(run, results)
  ctx.phase?.('HANDOFF')
  const handoff = await writeHandoff(ctx, run, epics, results)
  if ('status' in handoff) return handoff
  await ctx.pause('handoff-reviewed')
  if (!isReviewed(await readFile(join(run.handoffDir, 'handoff.md'), 'utf8'))) {
    return outcome(run, 'waiting-review', `check the Human Review box of ${display(run, join(run.handoffDir, 'handoff.md'))}, then resume the run`)
  }
  ctx.phase?.('PUBLISH')
  return publishHandoff(ctx, run, handoff.plan, host)
}

/**
 * @typedef {{
 *   cwd: string, slug: string, prd: string, prdText: string, dir: string, handoffDir: string,
 *   inventory: import('./prd-inventory.mjs').Inventory, map: import('./story-map.mjs').StoryMap,
 *   agentIds: Record<string, string>, models: Record<string, string>, pluginName: string, listed: string[] | null,
 *   now: () => string, repo: string | null, prdUrl: string, epics: string[] | null,
 *   answers: Record<string, import('./story.mjs').Answers>, touched: Map<string, string[]> | null,
 * }} Run epics: the epics to elaborate, null for all; answers: the draft answers of the canvas;
 *   touched: in a correction session, the stories the accepted corrections touch, with what the writer is told
 */

/** @param {WorkflowContext} ctx @param {Host} host @returns {Promise<Run | { status: string, reason: string }>} */
const prepare = async (ctx, { cwd, now = () => new Date().toISOString(), gh = ghCli(cwd) }) => {
  ctx.phase?.('INVENTORY')
  const { prd } = ctx.args ?? {}
  if (typeof prd !== 'string' || prd.trim() === '') return { status: 'refused', reason: 'args.prd: the path of the PRD is required' }
  const path = isAbsolute(prd) ? prd : resolve(cwd, prd)
  const prdText = await readFile(path, 'utf8').catch(() => null)
  if (prdText === null) return { status: 'refused', reason: `args.prd: ${prd} cannot be read` }
  const slug = typeof ctx.args.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ctx.args.slug) ? ctx.args.slug : slugOf(path)
  const dir = join(cwd, '.copilot-tracking', 'skraft-plans', slug, 'backlog')
  const inventory = await ctx.step(`inventory-v1:${slug}`, () => inventoryOf(prdText))
  if (!inventory.requirements.some((r) => r.kind === 'FR')) return { status: 'refused', reason: `${prd} defines no FR-### requirement` }
  await write(join(dir, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`)
  const repoInfo = await ctx.step('repo-v1', () => repositoryOf(ctx.args.repo, gh))
  const relativePrd = relative(cwd, path).split(sep).join('/')
  ctx.log(`${slug}: ${inventory.requirements.length} requirement ids, ${inventory.epics.length} epics in the PRD`)
  return {
    cwd, slug, prd: path, prdText, dir, inventory, map: /** @type {any} */ (null),
    handoffDir: join(cwd, '.copilot-tracking', 'github-issues', 'prds', slug),
    agentIds: record(ctx.args.agentIds), models: record(ctx.args.models), pluginName: 'skraft-backlog',
    listed: await listAgents(ctx), now, repo: repoInfo.repo, epics: Array.isArray(ctx.args.epics) ? ctx.args.epics.map(String) : null,
    answers: record((await readJson(join(dir, 'answers.json'))).value?.stories), touched: null,
    prdUrl: repoInfo.repo ? `https://github.com/${repoInfo.repo}/blob/${repoInfo.branch}/${relativePrd}` : relativePrd,
  }
}

/** @param {unknown} repo @param {import('./publish.mjs').GhRun} gh */
const repositoryOf = (repo, gh) => {
  const answer = gh(['repo', 'view', ...(typeof repo === 'string' && repo ? [repo] : []), '--json', 'nameWithOwner,defaultBranchRef'])
  if (answer.status !== 0) return { repo: typeof repo === 'string' && repo ? repo : null, branch: 'main' }
  const data = JSON.parse(answer.stdout)
  return { repo: data.nameWithOwner, branch: data.defaultBranchRef?.name ?? 'main' }
}

/** @param {string} path */
const slugOf = (path) => basename(path).replace(/\.md$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'backlog'

/** @param {unknown} value @returns {Record<string, string>} */
const record = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, string>} */ (value) : {})

/** @param {string} path @param {string} text */
const write = async (path, text) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf8')
}

/** @param {string} path */
const readJson = async (path) => {
  try { return { value: JSON.parse(await readFile(path, 'utf8')) } } catch (error) {
    return { error: /** @type {Error} */ (error).message, code: /** @type {NodeJS.ErrnoException} */ (error).code ?? null }
  }
}

/** File-system errors: the agent's answer was never read, so its content was never judged. */
export const INFRA_CODES = Object.freeze(new Set(['ENOTDIR', 'ENOENT', 'EACCES', 'EPERM', 'EISDIR', 'EBUSY', 'EMFILE', 'ENOSPC', 'EROFS']))

/** A failure of the files, not of what the agent wrote: replay it, never retry it blindly. */
export class InfraError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) { super(message); this.name = 'InfraError'; this.code = code }
}

/**
 * The directory `dir` exists, as a directory, and so does every directory between the backlog
 * and it. A file in the way is moved aside to `<name>.stray-<time>` (logged), never deleted.
 * @param {WorkflowContext} ctx @param {Run} run @param {string} dir
 */
export const ensureDir = async (ctx, run, dir) => {
  const inside = relative(run.dir, dir)
  const steps = inside && !inside.startsWith('..') && !isAbsolute(inside) ? inside.split(sep) : []
  let path = run.dir
  for (const step of ['', ...steps]) {
    path = step ? join(path, step) : path
    const info = await stat(path).catch(() => null)
    if (info && !info.isDirectory()) {
      const aside = `${path}.stray-${run.now().replace(/[:.]/g, '-')}`
      await rename(path, aside)
      ctx.log(`${display(run, path)} was a file: moved to ${display(run, aside)}, created as a directory`)
    }
  }
  await mkdir(dir, { recursive: true })
}

/** The one file a brief asks the agent to write. @param {string} prompt */
const outputOf = (prompt) => /^Write only: (\S+)/m.exec(prompt)?.[1] ?? null

/** @param {Run} run @param {string} path */
const display = (run, path) => relative(run.cwd, path).split(sep).join('/')

/** @param {Run} run @param {string} status @param {string} reason @param {object} [details] */
const outcome = (run, status, reason, details = {}) => ({ status, slug: run.slug, reason, ...details })

/** @param {Run} run @param {string} phase @param {string[]} problems */
const blocked = (run, phase, problems) => outcome(run, 'blocked', `${phase}: ${problems.length} problem(s) left after ${MAX_ATTEMPTS} attempts`, { phase, problems })

// ── Agents ──────────────────────────────────────────────────────────────────────────────────────

/** @param {WorkflowContext} ctx @returns {Promise<string[] | null>} */
const listAgents = async (ctx) => {
  const list = ctx.session?.rpc?.agent?.list
  if (typeof list !== 'function') return null
  try {
    const answer = await list({})
    return Array.isArray(answer?.agents) ? answer.agents.flatMap((a) => [a.id, a.name, a.displayName].filter(Boolean)) : null
  } catch {
    return null
  }
}

/** The session id of a plugin agent file id. @param {Run} run @param {string} id */
export const agentOf = (run, id) => {
  if (run.agentIds[id]) return run.agentIds[id]
  if (run.listed === null) return `${run.pluginName}:${id}`
  return run.listed.find((name) => name === `${run.pluginName}:${id}`) ?? run.listed.find((name) => name === id || name.endsWith(`:${id}`)) ?? `${run.pluginName}:${id}`
}

/** @param {WorkflowContext} ctx @param {Run} run @param {string} id @param {string} label @param {string} prompt */
/**
 * Every agent is dispatched here: the directory of the file its brief names exists before it runs.
 * @param {WorkflowContext} ctx @param {Run} run @param {string} id @param {string} label @param {string} prompt
 */
const dispatch = async (ctx, run, id, label, prompt) => {
  const output = outputOf(prompt)
  if (output) await ensureDir(ctx, run, dirname(output))
  return ctx.agent(prompt, { label, agent: agentOf(run, id), ...(run.models[id] ? { model: run.models[id] } : {}) })
}

// ── SLICE ───────────────────────────────────────────────────────────────────────────────────────

/**
 * A story map already on disk that passes the checks is kept: a new run resumes from it (delete
 * the file to slice again); one that fails goes to the slicer with its problems.
 * @param {WorkflowContext} ctx @param {Run} run
 */
const slice = async (ctx, run) => {
  const output = join(run.dir, 'story-map.json')
  const existing = await checkedMap(ctx, run)
  if (existing.map && !existing.problems.length) {
    ctx.log(`${display(run, output)} passes the checks: reused (delete it to slice again)`)
    return existing
  }
  let problems = existing.map ? existing.problems : []
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await dispatch(ctx, run, 'backlog-slicer', `slice · attempt ${attempt}`, sliceBrief({
      prd: run.prd, inventory: join(run.dir, 'inventory.json'), output, language: run.inventory.language, attempt, problems,
    }))
    const checked = await checkedMap(ctx, run)
    problems = checked.problems
    ctx.log(`story map attempt ${attempt}: ${problems.length ? `${problems.length} problem(s)` : 'checks pass'}`)
    if (!problems.length) return checked
  }
  return { problems }
}

/**
 * The story map on disk, normalized (what a script can fix is fixed and written back), checked,
 * and rendered for the reviewer.
 * @param {WorkflowContext} ctx @param {Run} run
 */
const checkedMap = async (ctx, run) => {
  const path = join(run.dir, 'story-map.json')
  const read = await readJson(path)
  if ('error' in read) return { problems: [`story-map.json cannot be read: ${read.error}`], map: null }
  const { map, changes } = normalizeStoryMap(read.value)
  if (changes.length) {
    await write(path, `${JSON.stringify(map, null, 2)}\n`)
    ctx.log(`story map normalized: ${changes.length} fix(es) — ${changes.slice(0, 5).join('; ')}${changes.length > 5 ? '; …' : ''}`)
  }
  const findings = checkStoryMap(map, run.inventory)
  if (!findings.problems.length) await write(join(run.dir, 'story-map.md'), renderStoryMap(/** @type {any} */ (map), { prd: display(run, run.prd), findings }))
  return { problems: findings.problems, map: /** @type {import('./story-map.mjs').StoryMap} */ (map) }
}

/** On resume the human may have edited the map: it is checked again, as it reads now. @param {WorkflowContext} ctx @param {Run} run */
const approvedMap = (ctx, run) => checkedMap(ctx, run)

/** @param {Run} run */
const selectedEpics = (run) => (run.epics ? run.map.epics.filter((e) => /** @type {string[]} */ (run.epics).includes(e.id)) : run.map.epics)

/** @param {Run} run @returns {string[]} */
const unknownEpics = (run) => (run.epics ?? []).filter((id) => !run.map.epics.some((e) => e.id === id))

// ── ELABORATE and REVIEW ────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ file: import('./story.mjs').StoryFile | null, problems: string[],
 *   details: Array<{ rule: string, kind: string, message: string }>, attempt: number }} Draft
 * @typedef {{ epic: string, verdict: string, ready: string[], notReady: Record<string, string[]>,
 *   files: Record<string, import('./story.mjs').StoryFile>, proposals: import('./review.mjs').SliceProposal[] }} EpicResult
 */

/** A draft whose writer threw: its reason for the human is in the PRD's language. @param {Run} run @returns {Draft} */
const writerFailed = (run) => ({ file: null, problems: ['the story writer failed'],
  details: [{ rule: 'writer-failed', kind: 'problem', message: say(run.inventory.language, 'writerFailed') }], attempt: 1 })

/**
 * Why the checks refuse a draft, as a human reads it: each problem in the PRD's language (the
 * wording of the canvas), never the English message the story writer receives.
 * @param {Run} run @param {Draft} draft
 */
const humanProblems = (run, draft) => draft.details.filter((d) => d.kind === 'problem')
  .map((d) => explanation(run.inventory.language, { source: 'check', rule: d.rule, params: /** @type {any} */ (d).params, message: d.message }).why)

/** @param {Run} run */
const knownOf = (run) => new Set(run.inventory.requirements.map((r) => r.id))

/** @param {Run} run @param {string} id */
const storyPath = (run, id) => join(run.dir, 'stories', `${id}.json`)

/**
 * The writers run in parallel and write into `stories/`: it exists, as a directory, before any
 * of them starts.
 * @param {WorkflowContext} ctx @param {Run} run
 */
const prepareStoriesDir = async (ctx, run) => {
  for (const name of ['stories', 'plans', 'reviews']) await ensureDir(ctx, run, join(run.dir, name))
  await sweep(ctx, run)
}

/** What the workflow writes at the root of the backlog directory; anything else is stray. */
const BACKLOG_ENTRIES = Object.freeze(new Set(['inventory.json', 'story-map.json', 'story-map.md', 'plan.json', 'published.json',
  'review.json', 'slice-proposals.json', 'corrections.json', 'answers.json', 'stories', 'plans', 'reviews', 'corrections']))

/**
 * Removes, and logs, the files no step of the workflow plans: at the root of the backlog, and in
 * `stories/` anything but `<story id>.json` of the map (test files, probes, misplaced copies).
 * @param {WorkflowContext} ctx @param {Run} run
 */
const sweep = async (ctx, run) => {
  const ids = new Set(storiesOf(run.map).map((s) => `${s.id}.json`))
  const stray = [
    ...(await strayIn(run.dir, (entry) => BACKLOG_ENTRIES.has(entry.name) || entry.name.includes('.stray-'))),
    ...(await strayIn(join(run.dir, 'stories'), (entry) => entry.isFile() && ids.has(entry.name))),
  ]
  for (const path of stray) await rm(path, { recursive: true, force: true })
  if (stray.length) ctx.log(`removed ${stray.length} file(s) no step plans: ${stray.map((path) => display(run, path)).join(', ')}`)
}

/** @param {string} dir @param {(entry: import('node:fs').Dirent) => boolean} expected */
const strayIn = async (dir, expected) => (await readdir(dir, { withFileTypes: true }).catch(() => []))
  .filter((entry) => !entry.name.endsWith('.tmp') && !expected(entry))
  .map((entry) => join(dir, entry.name))

/**
 * The story file on disk, with what the map decides written into it, then checked. `answers` are
 * written into its open questions only after a writer received them.
 * @param {Run} run @param {import('./story-map.mjs').MapStory & { epic: string }} planned @param {import('./story.mjs').Answers} [answers]
 * @returns {Promise<Omit<Draft, 'attempt'>>}
 */
const readStory = async (run, planned, answers = {}) => {
  const path = storyPath(run, planned.id)
  const read = await readJson(path)
  if ('error' in read) {
    const message = `${planned.id}.json cannot be read: ${read.error}`
    return { file: null, problems: [message], details: [{ rule: 'unreadable', kind: 'problem', message: say(run.inventory.language, 'unreadable', { story: planned.id, error: read.error }) }] }
  }
  const { file, changes } = normalizeStory(read.value, planned, answers)
  if (changes.length) await write(path, `${JSON.stringify(file, null, 2)}\n`)
  const checked = checkStory(file, planned, knownOf(run))
  return { file: checked.problems.length ? null : /** @type {import('./story.mjs').StoryFile} */ (file), problems: checked.problems, details: checked.details }
}

/**
 * One story, written then checked; refused files are sent back with the problems the
 * normalization left.
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapStory & { epic: string }} planned
 * @param {{ findings?: string[], problems?: string[], first?: number, attempts?: number }} [round]
 * @returns {Promise<Draft>}
 */
const writeStory = async (ctx, run, planned, { findings = [], problems = [], first = 1, attempts = MAX_ATTEMPTS } = {}) => {
  let last = { problems, details: [] }
  const answers = run.answers[planned.id] ?? {}
  for (let attempt = first; attempt < first + attempts; attempt += 1) {
    await dispatch(ctx, run, 'story-writer', `write ${planned.id} · attempt ${attempt}`, storyBrief({
      prd: run.prd, map: join(run.dir, 'story-map.json'), story: planned.id, epic: planned.epic, output: storyPath(run, planned.id),
      language: run.inventory.language, attempt, problems: last.problems, findings: attempt === first ? findings : [],
      answers: await pendingAnswers(run, planned.id),
    }))
    const read = await readStory(run, planned, answers)
    if (read.file) return { ...read, attempt }
    last = read
    if (needsCorrection(read)) return { ...read, attempt }
  }
  return { file: null, problems: last.problems, details: last.details, attempt: first + attempts - 1 }
}

/**
 * Refused only by rules the writer cannot lift (too big: the map fixes the scope): a correction
 * the human accepts in the canvas is the way out, a retry is not.
 * @param {{ details: Array<{ rule: string, kind: string }> }} draft
 */
const needsCorrection = (draft) => {
  const problems = draft.details.filter((d) => d.kind === 'problem')
  return problems.length > 0 && problems.every((d) => CORRECTION_RULES.has(d.rule))
}

/**
 * The answers of the canvas the story file does not hold yet, as "Q1: question → answer".
 * @param {Run} run @param {string} id @returns {Promise<string[]>}
 */
const pendingAnswers = async (run, id) => {
  const answers = run.answers[id] ?? {}
  if (!Object.keys(answers).length) return []
  const read = await readJson(storyPath(run, id))
  const questions = openQuestionsOf('value' in read ? read.value?.openQuestions : [])
  return questions.filter((q) => answers[q.id]?.text && q.answer !== answers[q.id].text).map((q) => `${q.id}: ${q.question} → ${answers[q.id].text}`)
}

/**
 * The first draft of every story, all epics at once: a file already on disk that passes the
 * checks is kept (a new run resumes from it); the others get one writer each.
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapEpic[]} epics
 * @returns {Promise<Map<string, Draft>>}
 */
const firstDrafts = async (ctx, run, epics) => {
  const planned = epics.flatMap((epic) => epic.stories.map((story) => ({ ...story, epic: epic.id })))
  const drafts = await ctx.parallel(planned.map((story) => () => firstDraft(ctx, run, story)))
  return new Map(planned.map((story, index) => [story.id, drafts[index] ?? writerFailed(run)]))
}

/**
 * A story a correction touches is written with what the correction says. Otherwise a file on
 * disk that passes is reused; one only a correction can lift waits for it; in a correction
 * session nothing else is written.
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapStory & { epic: string }} planned
 */
const firstDraft = async (ctx, run, planned) => {
  if (run.touched?.has(planned.id)) return writeStory(ctx, run, planned, { findings: run.touched.get(planned.id) })
  const existing = await readStory(run, planned)
  if (existing.file) {
    ctx.log(`${planned.id}: the story file on disk passes the checks, reused`)
    return { ...existing, attempt: 1 }
  }
  if (run.touched || needsCorrection(existing)) return { ...existing, attempt: MAX_ATTEMPTS }
  return writeStory(ctx, run, planned, { attempts: 1 })
}

/**
 * Trips when one check refuses most first drafts: the cause is shared, retrying each story would
 * pay for the same failure again.
 * @param {Map<string, Draft>} drafts
 * @returns {{ reason: string, problems: string[] } | null}
 */
export const breakerOf = (drafts) => {
  const byRule = new Map()
  for (const [id, draft] of drafts) {
    const rules = draft.details.filter((d) => d.kind === 'problem' && !CORRECTION_RULES.has(d.rule)).map((d) => d.rule)
    for (const rule of new Set(rules)) byRule.set(rule, [...(byRule.get(rule) ?? []), id])
  }
  const [rule, ids] = [...byRule].sort((a, b) => b[1].length - a[1].length)[0] ?? [null, []]
  if (!rule || ids.length < BREAKER.min || ids.length / drafts.size < BREAKER.share) return null
  const sample = /** @type {Draft} */ (drafts.get(ids[0])).details.find((d) => d.rule === rule)?.message
  return {
    reason: `ELABORATE: ${ids.length} of ${drafts.size} first drafts fail the same check (${rule}); fix its cause (brief, skill, schema) before any retry`,
    problems: [`${rule}: ${sample}`, `stories: ${ids.join(', ')}`],
  }
}

/**
 * @typedef {{ approved: Set<string>, held: Map<string, string[]>, findings: Map<string, import('./review.mjs').Defect[]>,
 *   verdicts: Map<string, string>, verdict: string, proposals: import('./review.mjs').SliceProposal[] }} EpicReview
 */

/**
 * The stories refused by the checks get their remaining attempts; then the review runs on the
 * stories that pass, each story getting its own verdict. An approved story is not reviewed
 * again; a story whose finding asks for a dependency the map lacks waits for the map's owner.
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapEpic} epic @param {Map<string, Draft>} drafts
 * @returns {Promise<EpicResult>}
 */
const elaborateAndReview = async (ctx, run, epic, drafts) => {
  const state = new Map(epic.stories.map((story) => [story.id, drafts.get(story.id) ?? writerFailed(run)]))
  if (!run.touched) await retryRefused(ctx, run, epic, state)
  /** @type {EpicReview} */
  const review = { approved: new Set(), held: new Map(), findings: new Map(), verdicts: new Map(), verdict: 'NEEDS_REWORK', proposals: [] }
  const saved = await savedVerdicts(run, epic.id)
  carryOver(run, epic, state, review, saved)
  const base = await lastRound(run, epic.id)
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const pending = epic.stories.map((s) => s.id).filter((id) => state.get(id)?.file && !review.approved.has(id) && !review.held.has(id))
    if (!pending.length) break
    recordReview(review, await reviewEpic(ctx, run, epic, state, pending, attempt, base), pending, run.inventory.language)
    ctx.log(`${epic.id} review attempt ${attempt}: ${review.verdict}, ${review.approved.size} of ${epic.stories.length} stories approved`)
    if (attempt === MAX_ATTEMPTS) break
    await rework(ctx, run, epic, state, pending.filter((id) => review.findings.get(id)?.length), review.findings)
  }
  const result = resultOf(run, epic, state, review)
  await saveVerdicts(run, epic, state, result, saved)
  return result
}

/** @param {any} file */
const fingerprintOf = (file) => sha256(JSON.stringify(file))

/** @param {Run} run @param {string} epic */
const verdictsPath = (run, epic) => join(run.dir, 'reviews', epic, 'stories.json')

/**
 * What the last reviews decided per story, with the fingerprint of the file they judged.
 * @param {Run} run @param {string} epic @returns {Promise<Record<string, { verdict: string | null, fingerprint: string, reasons: string[] }>>}
 */
const savedVerdicts = async (run, epic) => record((await readJson(verdictsPath(run, epic))).value)

/**
 * A story approved before, whose file has not changed since, is not reviewed again. In a
 * correction session a story the corrections do not touch keeps where it stood.
 * @param {Run} run @param {import('./story-map.mjs').MapEpic} epic @param {Map<string, Draft>} state @param {EpicReview} review
 * @param {Record<string, { verdict: string | null, fingerprint: string, reasons: string[] }>} saved
 */
const carryOver = (run, epic, state, review, saved) => {
  for (const { id } of epic.stories) {
    const file = state.get(id)?.file
    const before = saved[id]
    if (run.touched?.has(id)) continue
    if (file && before?.verdict === 'APPROVED' && before.fingerprint === fingerprintOf(file)) review.approved.add(id)
    else if (run.touched && file) review.held.set(id, before?.reasons?.length ? before.reasons : [say(run.inventory.language, 'notCorrected')])
  }
}

/**
 * @param {Run} run @param {import('./story-map.mjs').MapEpic} epic @param {Map<string, Draft>} state @param {EpicResult} result
 * @param {Record<string, { verdict: string | null, fingerprint: string, reasons: string[] }>} saved
 */
const saveVerdicts = async (run, epic, state, result, saved) => {
  const verdicts = Object.fromEntries(epic.stories.filter((s) => state.get(s.id)?.file).map(({ id }) => [id, {
    verdict: result.ready.includes(id) ? 'APPROVED' : saved[id]?.verdict === 'APPROVED' ? 'NEEDS_REWORK' : saved[id]?.verdict ?? 'NEEDS_REWORK',
    fingerprint: fingerprintOf(state.get(id)?.file), reasons: result.notReady[id] ?? [],
  }]))
  await write(verdictsPath(run, epic.id), `${JSON.stringify(verdicts, null, 2)}\n`)
}

/** The number of the last review file of an epic: a new run numbers its rounds after it. @param {Run} run @param {string} epic */
const lastRound = async (run, epic) => Math.max(0, ...(await readdir(join(run.dir, 'reviews', epic)).catch(() => []))
  .map((name) => Number(/^discuss-review-(\d+)\.json$/.exec(name)?.[1] ?? 0)))

/**
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapEpic} epic
 * @param {Map<string, Draft>} state
 */
const retryRefused = async (ctx, run, epic, state) => {
  const refused = epic.stories.filter((story) => !state.get(story.id)?.file && !needsCorrection(/** @type {Draft} */ (state.get(story.id))))
  const retried = await ctx.parallel(refused.map((story) => () => {
    const draft = /** @type {Draft} */ (state.get(story.id))
    return writeStory(ctx, run, { ...story, epic: epic.id }, { problems: draft.problems, first: draft.attempt + 1, attempts: MAX_ATTEMPTS - 1 })
  }))
  refused.forEach((story, index) => { if (retried[index]) state.set(story.id, /** @type {Draft} */ (retried[index])) })
}

/**
 * @param {EpicReview} review @param {Awaited<ReturnType<typeof reviewEpic>>} outcome @param {string[]} pending
 * @param {'fr' | 'en'} language
 */
const recordReview = (review, outcome, pending, language) => {
  review.verdict = outcome.verdict
  for (const id of pending) {
    const proposals = outcome.slice.filter((p) => p.story === id)
    const verdict = /** @type {{ verdict: string, findings: any[] }} */ (outcome.verdicts.get(id))
    review.verdicts.set(id, verdict.verdict)
    review.findings.set(id, verdict.findings)
    if (proposals.length) {
      review.proposals.push(...proposals)
      review.held.set(id, proposals.map((p) => sliceReason(p, language)))
    } else if (verdict.verdict === 'APPROVED') review.approved.add(id)
  }
}

/** @param {import('./review.mjs').SliceProposal} p @param {'fr' | 'en'} language */
const sliceReason = (p, language) => say(language, 'sliceMissing', p)

/**
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapEpic} epic
 * @param {Map<string, Draft>} state @param {string[]} pending the stories this review judges
 * @param {number} attempt @param {number} [base] the last review file of the epic before this run
 */
const reviewEpic = async (ctx, run, epic, state, pending, attempt, base = 0) => {
  const files = new Map(epic.stories.filter((s) => state.get(s.id)?.file).map((s) => [s.id, /** @type {import('./story.mjs').StoryFile} */ (state.get(s.id)?.file)]))
  const plans = join(run.dir, 'plans')
  const storiesPath = join(plans, `stories-${epic.id}.md`)
  await write(storiesPath, renderStoriesFile(epic, run.map, files, run.inventory.language))
  const drafts = []
  for (const id of pending) {
    const path = join(plans, `ac-draft-${id}.md`)
    await write(path, renderAcDraft(/** @type {import('./story.mjs').StoryFile} */ (files.get(id)), run.inventory.language))
    drafts.push(path)
  }
  const judge = pending.length < files.size ? pending : []
  const answers = await ctx.parallel(LENSES.map((lens) => () => dispatch(ctx, run, lens.agent, `${epic.id} · ${lens.name} · attempt ${attempt}`,
    lensBrief({ lens, epic: epic.id, stories: storiesPath, drafts, attempt, judge, language: run.inventory.language }))))
  const reviews = join(run.dir, 'reviews', epic.id)
  const results = []
  for (const [index, lens] of LENSES.entries()) {
    const text = answers[index] ?? ''
    await write(join(reviews, `discuss-lens-${lens.name}-${base + attempt}.yaml`), `${text}\n`)
    try { results.push(parseLensResult(text)) } catch (error) { results.push({ lens: lens.name, verdict: 'unparseable', defects: [], error: /** @type {Error} */ (error).message }) }
  }
  const ids = epic.stories.map((s) => s.id)
  const judged = judgedOnly(results, pending, ids)
  const triaged = triageDefects(judged.results, run.map)
  const review = computeVerdict('discuss', triaged.results)
  const verdicts = storyVerdicts(triaged.results, pending, ids)
  const stories = Object.fromEntries([...verdicts].map(([id, v]) => [id, v.verdict]))
  await write(join(reviews, `discuss-review-${base + attempt}.json`), `${JSON.stringify({ ...review, stories, dismissed: triaged.dismissed, slice: triaged.slice, discarded: judged.discarded }, null, 2)}\n`)
  return { verdict: review.verdict, verdicts, slice: triaged.slice }
}

/**
 * The stories the findings name are written again with their own findings.
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapEpic} epic
 * @param {Map<string, Draft>} state @param {string[]} targets
 * @param {Map<string, import('./review.mjs').Defect[]>} findings
 */
const rework = async (ctx, run, epic, state, targets, findings) => {
  const stories = epic.stories.filter((s) => targets.includes(s.id))
  const rewritten = await ctx.parallel(stories.map((story) => () => writeStory(ctx, run, { ...story, epic: epic.id }, {
    findings: (findings.get(story.id) ?? []).map((f) => `${f.gate ? `${f.gate}: ` : ''}${f.description ?? ''}${f.suggestion ? ` — ${f.suggestion}` : ''}`),
    first: /** @type {Draft} */ (state.get(story.id)).attempt + 1,
  })))
  stories.forEach((story, index) => { if (rewritten[index]) state.set(story.id, /** @type {Draft} */ (rewritten[index])) })
}

/**
 * @param {Run} run @param {import('./story-map.mjs').MapEpic} epic @param {Map<string, Draft>} state @param {EpicReview} review
 * @returns {EpicResult}
 */
const resultOf = (run, epic, state, review) => {
  const ready = epic.stories.filter((s) => review.approved.has(s.id) && state.get(s.id)?.file).map((s) => s.id)
  const notReady = Object.fromEntries(epic.stories.filter((s) => !ready.includes(s.id)).map((s) => [s.id, reasonsOf(run, s.id, epic, state, review)]))
  const files = Object.fromEntries([...state].filter(([, s]) => s.file).map(([id, s]) => [id, /** @type {import('./story.mjs').StoryFile} */ (s.file)]))
  return { epic: epic.id, verdict: review.verdict, ready, notReady, files, proposals: review.proposals }
}

/**
 * Why a story is not ready, in the PRD's language: the check problems, the SLICE proposal, the
 * lens findings (the lenses write them in that language), or the verdict of its review.
 * @param {Run} run @param {string} id @param {import('./story-map.mjs').MapEpic} epic @param {Map<string, Draft>} state @param {EpicReview} review
 */
const reasonsOf = (run, id, epic, state, review) => {
  const draft = /** @type {Draft} */ (state.get(id))
  if (!draft.file && draft.details.length) return humanProblems(run, draft)
  if (review.held.has(id)) return /** @type {string[]} */ (review.held.get(id))
  const own = (review.findings.get(id) ?? []).map((f) => f.description ?? '')
  return own.length ? own : [say(run.inventory.language, 'reviewEnded', { story: id, epic: epic.id, verdict: review.verdicts.get(id) ?? review.verdict })]
}

/**
 * The dependencies the review found missing from the map, for its owner: `slice-proposals.json`
 * with the `after` each story has and the `after` the findings propose.
 * @param {WorkflowContext} ctx @param {Run} run @param {Array<EpicResult | null>} results
 */
const writeSliceProposals = async (ctx, run, results) => {
  const proposals = results.flatMap((result) => result?.proposals ?? [])
  const path = join(run.dir, 'slice-proposals.json')
  if (!proposals.length) return rm(path, { force: true })
  await write(path, `${JSON.stringify({ version: 1, proposals }, null, 2)}\n`)
  ctx.log(`SLICE: ${proposals.length} dependency proposal(s) for the story map in ${display(run, path)}`)
}

// ── CORRECT ─────────────────────────────────────────────────────────────────────────────────────

/** @param {Run} run */
const correctionsPath = (run) => join(run.dir, 'corrections.json')

/** @param {Run} run */
const readCorrections = async (run) => correctionsOf((await readJson(correctionsPath(run))).value)

/** @param {Run} run @param {object} corrections */
const saveCorrections = (run, corrections) => write(correctionsPath(run), `${JSON.stringify(corrections, null, 2)}\n`)

/** @param {Map<string, string[]>} touched @param {string} id @param {string} instruction */
const touch = (touched, id, instruction) => touched.set(id, [...(touched.get(id) ?? []), instruction])

/**
 * The correction session: the corrections a human accepted and the answers given in the canvas,
 * applied. A structural correction changes the map (the slicer names the parts of a split, the
 * code moves the stories); then the touched stories are written with what each correction says.
 * Nothing changes without an accepted decision; a map the corrections break is not written.
 * @param {WorkflowContext} ctx @param {Run} run
 * @returns {Promise<{ touched: Map<string, string[]> } | { status: string, reason: string }>}
 */
const correct = async (ctx, run) => {
  const corrections = await readCorrections(run)
  const accepted = acceptedOf(corrections)
  const answered = await storiesWithAnswers(run)
  run.touched = new Map()
  if (!accepted.length && !answered.length) {
    if (corrections.session?.status === 'done') return { touched: run.touched }
    return outcome(run, 'refused', 'corrections: no accepted correction and no answer to apply; decide in the backlog canvas first')
  }
  corrections.session = { status: 'running', startedAt: run.now(), applied: [], failed: {}, touched: [], verdicts: {} }
  await saveCorrections(run, corrections)
  const before = run.map
  for (const decision of accepted) await applyDecision(ctx, run, decision, corrections)
  for (const id of answered) touch(run.touched, id, 'Fold the answers of the product owner into the story.')
  const { map, changes } = normalizeStoryMap(run.map)
  const problems = checkStoryMap(map, run.inventory).problems
  if (problems.length) return failSession(run, corrections, before, problems)
  run.map = /** @type {import('./story-map.mjs').StoryMap} */ (map)
  await write(join(run.dir, 'story-map.json'), `${JSON.stringify(map, null, 2)}\n`)
  await write(join(run.dir, 'story-map.md'), renderStoryMap(run.map, { prd: display(run, run.prd), findings: checkStoryMap(map, run.inventory) }))
  for (const id of corrections.session.removed ?? []) await rm(storyPath(run, id), { force: true })
  corrections.session.touched = [...run.touched.keys()]
  await saveCorrections(run, corrections)
  ctx.log(`corrections: ${corrections.session.applied.length} applied, ${Object.keys(corrections.session.failed).length} failed, ${run.touched.size} stories to write${changes.length ? `, map normalized (${changes.length})` : ''}`)
  return { touched: run.touched }
}

/**
 * @param {Run} run @param {any} corrections @param {import('./story-map.mjs').StoryMap} before @param {string[]} problems
 */
const failSession = async (run, corrections, before, problems) => {
  run.map = before
  for (const id of corrections.session.applied) Object.assign(corrections.decisions[id], { status: 'failed', error: `the story map would not pass: ${problems[0]}` })
  corrections.session = { ...corrections.session, status: 'failed', endedAt: run.now(), failed: { ...corrections.session.failed, map: problems.join('; ') }, applied: [] }
  await saveCorrections(run, corrections)
  return blocked(run, 'CORRECT', problems)
}

/**
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./corrections.mjs').Decision} decision @param {any} corrections
 */
const applyDecision = async (ctx, run, decision, corrections) => {
  const id = decision.option.id
  try {
    await applyOption(ctx, run, decision, corrections.session)
    Object.assign(corrections.decisions[id], { status: 'applied', appliedAt: run.now() })
    corrections.session.applied.push(id)
  } catch (error) {
    const message = /** @type {Error} */ (error).message
    if (error instanceof InfraError) {
      corrections.decisions[id].error = `infrastructure (${error.code}): ${message}`
      corrections.session.failed[id] = `infrastructure (${error.code}): ${message} — the decision stays accepted, run the session again`
      ctx.log(`correction ${id}: infrastructure failure (${error.code}), kept accepted to replay`)
      return
    }
    Object.assign(corrections.decisions[id], { status: 'failed', error: message })
    corrections.session.failed[id] = message
  }
}

/**
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./corrections.mjs').Decision} decision @param {any} session
 */
const applyOption = async (ctx, run, { story, option, comment }, session) => {
  const said = comment ? ` Product owner: ${comment}` : ''
  if (SPLIT_KINDS.has(option.kind)) {
    const parts = await splitParts(ctx, run, story, option, comment)
    const { map, ids } = applySplit(run.map, story, parts)
    run.map = map
    ids.forEach((id, n) => touch(run.touched, id, `Story ${n + 1} of ${ids.length} split from ${story} (${option.title}): write it for this scope only — ${parts[n].title}: ${parts[n].description}.${said}`))
  } else if (option.kind === 'merge') {
    const merged = storiesOf(run.map).find((s) => s.id === story)
    run.map = applyMerge(run.map, story, /** @type {string} */ (option.target))
    run.touched.delete(story)
    session.removed = [...(session.removed ?? []), story]
    touch(run.touched, /** @type {string} */ (option.target), `${story} is merged into this story: deliver also "${merged?.title}" — ${merged?.description}; its covers are now this story's.${said}`)
  } else if (option.kind === 'declare-dependency') {
    run.map = applyDependency(run.map, story, option.add ?? [])
    touch(run.touched, story, `${option.instruction}${said}`)
  } else touch(run.touched, story, `${option.instruction}${said}`)
}

/**
 * The parts of an accepted split, named by the slicer and checked by the code.
 * @param {WorkflowContext} ctx @param {Run} run @param {string} story @param {import('./corrections.mjs').Option} option @param {string} [comment]
 */
const splitParts = async (ctx, run, story, option, comment) => {
  const original = storiesOf(run.map).find((s) => s.id === story)
  if (!original) throw new Error(`${story} is no story of the map`)
  const output = join(run.dir, 'corrections', `${story}.split.json`)
  let problems = []
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await dispatch(ctx, run, 'backlog-slicer', `split ${story} · attempt ${attempt}`, splitBrief({
      prd: run.prd, map: join(run.dir, 'story-map.json'), story, output, language: run.inventory.language, attempt, problems, option, comment,
    }))
    const read = await readJson(output)
    if ('error' in read && INFRA_CODES.has(read.code ?? '')) throw new InfraError(`${story}.split.json cannot be read: ${read.error}`, /** @type {string} */ (read.code))
    problems = 'error' in read ? [`${story}.split.json cannot be read: ${read.error}`] : splitProblems(original, read.value, option.impact.parts.length)
    if (!problems.length) return /** @type {import('./corrections.mjs').SplitPart[]} */ (read.value.stories)
  }
  throw new Error(`the split of ${story} was refused ${MAX_ATTEMPTS} times: ${problems.join('; ')}`)
}

/** The stories whose file does not hold an answer the canvas recorded. @param {Run} run */
const storiesWithAnswers = async (run) => {
  const ids = []
  for (const id of Object.keys(run.answers)) if ((await pendingAnswers(run, id)).length) ids.push(id)
  return ids
}

/**
 * What a human can correct now, with the decisions taken, written to `corrections.json`; a
 * correction session also records where each touched story ended.
 * @param {Run} run @param {Array<EpicResult | null>} results
 */
const snapshotCorrections = async (run, results) => {
  const loaded = await loadBacklog(run.cwd, run.slug)
  if ('error' in loaded) return
  const corrections = await readCorrections(run)
  const proposals = proposeCorrections({ map: run.map, files: loaded.raw.files, language: run.inventory.language, known: knownOf(run), reviews: loaded.raw.reviews, answers: run.answers })
  if (corrections.session?.status === 'running') {
    const ready = new Set(results.flatMap((r) => r?.ready ?? []))
    const notReady = Object.assign({}, ...results.map((r) => r?.notReady ?? {}))
    const verdicts = Object.fromEntries(corrections.session.touched.map((id) => [id, ready.has(id) ? 'APPROVED' : (notReady[id]?.[0] ?? 'NEEDS_REWORK')]))
    corrections.session = { ...corrections.session, status: 'done', endedAt: run.now(), verdicts }
  }
  const stories = Object.fromEntries(withDecisions(proposals, corrections).map((story) => [story.id, { epic: story.epic, findings: story.findings }]))
  await writeCorrections(run.cwd, run.slug, { ...corrections, stories })
}

// ── HANDOFF and PUBLISH ─────────────────────────────────────────────────────────────────────────

/**
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapEpic[]} epics
 * @param {Array<EpicResult | null>} results
 */
const writeHandoff = async (ctx, run, epics, results) => {
  const files = new Map()
  const held = new Map()
  for (const story of storiesOf(run.map)) held.set(story.id, [say(run.inventory.language, 'notElaborated')])
  epics.forEach((epic, index) => {
    const result = results[index]
    for (const story of epic.stories) held.set(story.id, [say(run.inventory.language, 'elaborationFailed', { epic: epic.id })])
    if (!result) return
    for (const id of result.ready) held.delete(id)
    for (const [id, reasons] of Object.entries(result.notReady)) held.set(id, reasons)
    for (const [id, file] of Object.entries(result.files)) files.set(id, file)
  })
  const notReady = holdBackDependents(run.map, held, run.inventory.language)
  const ready = new Set(storiesOf(run.map).map((s) => s.id).filter((id) => !notReady.has(id)))
  const backlog = { slug: run.slug, prd: display(run, run.prd), repo: run.repo, language: run.inventory.language, prdUrl: run.prdUrl, map: run.map, files, ready, notReady }
  const plan = planOperations(backlog)
  const problems = planProblems(plan)
  if (problems.length) return blocked(run, 'HANDOFF', problems)
  if (!plan.issues.length) return outcome(run, 'blocked', 'no story passed the planning review: nothing to publish', { phase: 'REVIEW', notReady: Object.fromEntries(notReady) })
  for (const [name, text] of Object.entries(renderHandoffFiles(plan, backlog, { now: run.now() }))) {
    if (name === 'handoff.md' && (await sameHandoff(join(run.handoffDir, name), text))) continue
    await write(join(run.handoffDir, name), text)
  }
  await write(join(run.dir, 'plan.json'), `${JSON.stringify({ ...plan, repo: run.repo, notReady: Object.fromEntries(plan.notReady) }, null, 2)}\n`)
  ctx.log(`handoff: ${plan.issues.length} issues, ${plan.links.length} links, ${notReady.size} stories held back`)
  return { plan }
}

/**
 * The handoff on disk plans the same operations: a resumed run keeps the box the human checked,
 * a changed plan replaces the file and needs a new review.
 * @param {string} path @param {string} text
 */
const sameHandoff = async (path, text) => {
  const current = await readFile(path, 'utf8').catch(() => null)
  const unchecked = (handoff) => handoff.replace(/^(>?\s*-\s+)\[[xX]\](\s+Reviewed and validated)/m, '$1[ ]$2')
  return current !== null && unchecked(current) === text
}

/**
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./handoff.mjs').Plan} plan @param {Host} host
 */
const publishHandoff = async (ctx, run, plan, { cwd, gh = ghCli(cwd) }) => {
  const dryRun = ctx.args.dryRun === true
  if (!run.repo) return outcome(run, 'refused', 'no repository to publish to: pass args.repo (owner/repo)')
  let report
  try {
    report = await publish({ plan, repo: run.repo, github: createGitHub(gh), dryRun, once: (key, produce) => ctx.step(`publish-${run.slug}-${key}`, produce) })
  } catch (error) {
    return outcome(run, 'blocked', /** @type {Error} */ (error).message, { phase: 'PUBLISH' })
  }
  await write(join(run.handoffDir, dryRun ? 'handoff-dryrun.md' : 'handoff-logs.md'), renderHandoffLogs(report, { slug: run.slug, now: run.now(), dryRun }))
  if (!dryRun) await writePublished(run.cwd, run.slug, publishedItems(plan, report, run.repo))
  const created = report.operations.filter((o) => o.status === 'created').length
  ctx.log(`${run.repo}: ${created} created, ${report.failed} failed, ${report.skipped} skipped${dryRun ? ' (dry run)' : ''}`)
  const status = report.failed + report.skipped ? 'blocked' : dryRun ? 'simulated' : 'published'
  return outcome(run, status, `${created} issues created on ${run.repo}${status === 'blocked' ? `; resume the run to retry: ${display(run, join(run.handoffDir, 'handoff-logs.md'))}` : ''}`,
    { phase: 'PUBLISH', mapping: report.mapping, failed: report.failed, skipped: report.skipped, notReady: Object.fromEntries(plan.notReady) })
}
