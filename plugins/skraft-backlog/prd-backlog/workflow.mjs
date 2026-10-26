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
import { LENSES, frameBrief, lensBrief, sliceBrief, splitBrief, storyBrief } from './briefs.mjs'
import { framingLines, framingOf, prdQuestions, slicerQuestions, unanswered } from './framing.mjs'
import { holdBackDependents, isReviewed, planOperations, planProblems, renderHandoffFiles } from './handoff.mjs'
import { CorrectionFailed, acceptedOf, applyDependency, applyMerge, applySplit, correctionsOf, proposeCorrections, SPLIT_KINDS, splitProblems, withDecisions } from './corrections.mjs'
import { fingerprintOf, inventoryOf, sha256 } from './prd-inventory.mjs'
import { PublishBlocked, createGitHub, ghCli, publish, publishedItems, renderHandoffLogs } from './publish.mjs'
import { loadBacklog, writeCorrections, writePublished } from './canvas/store.mjs'
import { renderAcDraft, renderStoriesFile, renderStoryMap, say } from './render.mjs'
import { explanation } from './canvas/ui/i18n.mjs'
import { judgedOnly, storyVerdicts, triageDefects } from './review.mjs'
import { CORRECTION_RULES, checkStory, integrationsOf, normalizeStory, openQuestionsOf } from './story.mjs'
import { checkStoryMap, normalizeStoryMap, storiesOf } from './story-map.mjs'

export const MAX_ATTEMPTS = 3

/**
 * The agents that may run at once, across the whole run: past this the host drops sub-agents
 * (story writers came back without writing their file). The others wait for a free slot.
 */
export const MAX_CONCURRENT_AGENTS = 8

/**
 * At most `limit` pieces of work at once; the others wait in arrival order. A finished piece
 * hands its slot straight to the next one, so no newcomer slips in between.
 * @param {number} limit
 * @returns {<T>(work: () => Promise<T>) => Promise<T>}
 */
export const slots = (limit) => {
  let active = 0
  const waiting = []
  return async (work) => {
    if (active < limit) active += 1
    else await new Promise((resolve) => waiting.push(resolve))
    try {
      return await work()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active -= 1
    }
  }
}

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
    'frame?: false to slice without the framing questions, ' +
    'corrections?: true to apply the corrections and answers accepted in the backlog canvas, then review only the stories they touch }. ' +
    'The agents are the plugin\'s; their model is the session\'s, never an argument.',
  limits: Object.freeze({ maxConcurrentSubagents: MAX_CONCURRENT_AGENTS }),
  phases: Object.freeze(['INVENTORY', 'FRAME', 'SLICE', 'CORRECT', 'ELABORATE', 'REVIEW', 'HANDOFF', 'PUBLISH'].map((title) => Object.freeze({ title }))),
  argsSchema: Object.freeze({
    type: 'object',
    required: ['prd'],
    additionalProperties: false,
    properties: Object.freeze({
      prd: { type: 'string' }, slug: { type: 'string' }, repo: { type: 'string' },
      epics: { type: 'array', items: { type: 'string' } },
      approve: { type: 'boolean' }, dryRun: { type: 'boolean' }, corrections: { type: 'boolean' }, frame: { type: 'boolean' },
    }),
  }),
})

/** Arguments are model-written: a key the workflow does not take is refused, never echoed. */
const INVALID_ARGS = Object.freeze({ status: 'refused', code: 'invalid-args', reason: 'the workflow takes only prd, slug, repo, epics, approve, dryRun, corrections and frame; nothing was started' })
/** @param {unknown} args */
const unknownKeys = (args) => Object.keys(args && typeof args === 'object' ? args : {}).some((key) => !Object.hasOwn(PRD_BACKLOG_META.argsSchema.properties, key))

/**
 * @typedef {{
 *   args: Record<string, any>, log: (message: string) => void, phase?: (title: string) => void,
 *   agent: (prompt: string, options: { label: string, agent?: string, model?: string }) => Promise<string | null | undefined>,
 *   step: <T>(key: string, produce: () => T | Promise<T>) => Promise<T>,
 *   parallel: <T>(thunks: Array<() => Promise<T>>) => Promise<Array<T | null>>, signal?: AbortSignal,
 *   pause: (key: string) => Promise<void>,
 *   session?: { rpc?: { agent?: { list?: (request?: object) => Promise<{ agents?: { id?: string, name?: string, displayName?: string }[] }> } } },
 * }} WorkflowContext
 * @typedef {{ cwd: string | null, now?: () => string, gh?: import('./publish.mjs').GhRun }} Host
 *   cwd: the session's working directory when the run starts, null while unknown
 */

const NO_DIRECTORY = Object.freeze({ status: 'refused', code: 'no-directory', reason: 'the session has no working directory yet' })

/**
 * @param {WorkflowContext} ctx
 * @param {Host} host
 */
export const runPrdBacklogWorkflow = async (ctx, host) => {
  try {
    return await runGuarded(ctx, host)
  } catch (error) {
    if (isHostStop(ctx, error)) throw error
    return { ...UNEXPECTED, slug: null }
  }
}

/**
 * The reason of a run that stopped on an exception: fixed, never the exception's text, which
 * reaches neither progress.json, the canvas nor the outcome.
 */
const UNEXPECTED = Object.freeze({ status: 'error', code: 'unexpected', reason: 'the run stopped on an unexpected error; run the workflow again to resume it' })

/** The errors ctx.pause threw: the host pausing the run, rethrown as they are. */
const PAUSES = new WeakSet()

/**
 * The host stopped the run: it paused it (ctx.pause threw), or cancelled it (its signal is
 * aborted, which the SDK does before it rejects pending calls). Only these are rethrown.
 * @param {WorkflowContext} ctx @param {unknown} error
 */
const isHostStop = (ctx, error) => ctx.signal?.aborted === true || (typeof error === 'object' && error !== null && PAUSES.has(error))

/** @param {WorkflowContext} ctx @param {Run} run @param {string} key */
const pause = async (ctx, run, key) => {
  try {
    await ctx.pause(key)
  } catch (error) {
    if (typeof error === 'object' && error !== null) PAUSES.add(error)
    run.pausedAt = key
    throw error
  }
}

/** @param {WorkflowContext} ctx @param {Host} host */
const runGuarded = async (ctx, host) => {
  const run = await prepare(ctx, host)
  if ('status' in run) return run
  await startProgress(ctx, run)
  try {
    const result = await stages(ctx, run, host)
    const ended = /** @type {any} */ (result)
    await endProgress(run, ended.status ?? 'done', ended.status && ended.status !== 'done' ? ended.reason : undefined, Array.isArray(ended.problems) ? ended.problems : undefined)
    return result
  } catch (error) {
    if (error instanceof AgentUnavailable) {
      const result = unavailable(run, run.progress.run.phase)
      await endProgress(run, 'blocked', result.reason)
      return result
    }
    if (isHostStop(ctx, error)) {
      await endProgress(run, 'paused', run.pausedAt)
      throw error
    }
    await endProgress(run, 'error', UNEXPECTED.reason)
    return { ...UNEXPECTED, slug: run.slug }
  }
}

/** @param {WorkflowContext} ctx @param {Run} run @param {Host} host */
const stages = async (ctx, run, host) => {
  const missing = missingAgents(run)
  if (missing.length) {
    return outcome(run, 'refused', `agents not registered in this session: ${missing.join(', ')} — restart the Copilot session, or reinstall the ${run.pluginName} plugin, then run again`, { phase: 'INVENTORY', missing })
  }
  ctx.phase?.('SLICE')
  const sliced = await slice(ctx, run)
  if (run.unavailable) return unavailable(run, 'SLICE')
  if (sliced.problems.length) return blocked(run, 'SLICE', sliced.problems)
  const correcting = ctx.args.corrections === true
  if (ctx.args.approve !== true && !correcting) await pause(ctx, run, 'story-map-approved')
  const approved = await approvedMap(ctx, run)
  if (approved.problems.length) return blocked(run, 'SLICE', approved.problems)
  run.map = /** @type {import('./story-map.mjs').StoryMap} */ (approved.map)
  if (unknownEpics(run).length) return outcome(run, 'refused', 'args.epics: an epic it names is not in the story map')
  if (correcting) {
    ctx.phase?.('CORRECT')
    const corrected = await correct(ctx, run)
    if (run.unavailable) return unavailable(run, 'CORRECT')
    if ('status' in corrected) return corrected
  }
  ctx.phase?.('ELABORATE')
  const epics = selectedEpics(run)
  await prepareStoriesDir(ctx, run)
  const drafts = await firstDrafts(ctx, run, epics)
  if (run.unavailable) return unavailable(run, 'ELABORATE')
  await verifyCorrections(ctx, run)
  const tripped = run.touched ? null : breakerOf(drafts)
  if (tripped) return outcome(run, 'blocked', tripped.reason, { phase: 'ELABORATE', problems: tripped.problems })
  ctx.phase?.('REVIEW')
  await rm(join(run.dir, 'plan.json'), { force: true })
  /** @type {Array<EpicResult | null | undefined>} */
  const finished = epics.map(() => undefined)
  const results = await ctx.parallel(epics.map((epic, index) => async () => {
    const result = await elaborateAndReview(ctx, run, epic, drafts)
    finished[index] = result
    await planSoFar(ctx, run, epics, finished)
    return result
  }))
  if (run.unavailable) return unavailable(run, 'REVIEW')
  await sweep(ctx, run)
  await writeSliceProposals(ctx, run, results)
  await snapshotCorrections(run, results)
  ctx.phase?.('HANDOFF')
  const handoff = await writeHandoff(ctx, run, epics, results)
  if ('status' in handoff) return handoff
  await pause(ctx, run, 'handoff-reviewed')
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
 *   pluginName: string, listed: string[] | null,
 *   now: () => string, repo: string | null, prdUrl: string, epics: string[] | null,
 *   answers: Record<string, import('./story.mjs').Answers>, touched: Map<string, string[]> | null,
 *   progress: Progress, progressWrite: Promise<void>, planWrite?: Promise<void>, salt: string, pass: string, slot: ReturnType<typeof slots>,
 *   unavailable?: AgentUnavailable, pausedAt?: string,
 *   reasons?: Record<string, Record<string, string>>, verify?: Array<{ decision: string, story: string, before: string | null, rules: string[] }>,
 * }} Run epics: the epics to elaborate, null for all; answers: the draft answers of the canvas;
 *   touched: in a correction session, the stories the accepted corrections touch, with what the writer is told
 */

/** @param {WorkflowContext} ctx @param {Host} host @returns {Promise<Run | { status: string, reason: string }>} */
const prepare = async (ctx, { cwd, now = () => new Date().toISOString(), gh = ghCli(cwd ?? undefined, { signal: ctx.signal }) }) => {
  if (cwd === null) return NO_DIRECTORY
  if (unknownKeys(ctx.args)) return INVALID_ARGS
  ctx.phase?.('INVENTORY')
  const { prd } = ctx.args ?? {}
  if (typeof prd !== 'string' || prd.trim() === '') return { status: 'refused', reason: 'args.prd: the path of the PRD is required' }
  const path = isAbsolute(prd) ? prd : resolve(cwd, prd)
  const prdText = await readFile(path, 'utf8').catch(() => null)
  if (prdText === null) return { status: 'refused', reason: 'args.prd: the PRD cannot be read' }
  const slug = typeof ctx.args.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ctx.args.slug) ? ctx.args.slug : slugOf(path)
  const dir = join(cwd, '.copilot-tracking', 'skraft-plans', slug, 'backlog')
  const inventory = await ctx.step(`inventory-v1:${slug}`, () => inventoryOf(prdText))
  if (!inventory.requirements.some((r) => r.kind === 'FR')) return { status: 'refused', reason: 'args.prd: the PRD defines no FR-### requirement' }
  await write(join(dir, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`)
  const repoInfo = await ctx.step('repo-v1', () => repositoryOf(ctx.args.repo, gh))
  const pass = await ctx.step('pass-v1', () => `${now()}|${Math.random().toString(36).slice(2, 10)}`)
  const relativePrd = relative(cwd, path).split(sep).join('/')
  ctx.log(`${slug}: ${inventory.requirements.length} requirement ids, ${inventory.epics.length} epics in the PRD`)
  return {
    cwd, slug, prd: path, prdText, dir, inventory, map: /** @type {any} */ (null),
    handoffDir: join(cwd, '.copilot-tracking', 'github-issues', 'prds', slug),
    pluginName: 'skraft-backlog',
    listed: await listAgents(ctx), now, repo: repoInfo.repo, epics: Array.isArray(ctx.args.epics) ? ctx.args.epics.map(String) : null,
    answers: record((await readJson(join(dir, 'answers.json'))).value?.stories), touched: null,
    progress: { version: 1, run: { startedAt: now(), phase: 'INVENTORY', status: 'running', mode: ctx.args.corrections === true ? 'corrections' : 'full' }, stories: {} },
    progressWrite: Promise.resolve(), salt: sha256(pass).slice(0, 12), pass, slot: slots(MAX_CONCURRENT_AGENTS),
    prdUrl: repoInfo.repo ? `https://github.com/${repoInfo.repo}/blob/${repoInfo.branch}/${relativePrd}` : relativePrd,
  }
}

/** @param {unknown} repo @param {import('./publish.mjs').GhRun} gh */
const repositoryOf = async (repo, gh) => {
  const answer = await gh(['repo', 'view', ...(typeof repo === 'string' && repo ? [repo] : []), '--json', 'nameWithOwner,defaultBranchRef'])
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

/** The runtime gave no answer: the agent is not registered, or failed before it ran. */
export class AgentUnavailable extends InfraError {
  /** @param {string} id @param {string} agent @param {string} label */
  constructor(id, agent, label) { super(`agent ${id} unavailable: ${agent} returned nothing for "${label}"`, 'AGENT_UNAVAILABLE'); this.name = 'AgentUnavailable' }
}

/** Every agent the workflow dispatches. */
export const REQUIRED_AGENTS = Object.freeze(['backlog-slicer', 'story-writer', 'planning-invest-lens', 'planning-ac-quality-lens', 'planning-coherence-lens', 'planning-dor-lens'])

/** The required agents the session does not list (none when it cannot list them). @param {Run} run */
export const missingAgents = (run) => (run.listed === null ? [] : REQUIRED_AGENTS.filter((id) =>
  !/** @type {string[]} */ (run.listed).some((name) => name === `${run.pluginName}:${id}` || name === id || name.endsWith(`:${id}`))))

/**
 * The run stops at the first agent that gives no answer: nothing it would do next can succeed,
 * and every further agent is a cost. Accepted corrections stay accepted.
 * @param {Run} run @param {string} phase
 */
const unavailable = (run, phase) => outcome(run, 'blocked', `${phase}: ${/** @type {AgentUnavailable} */ (run.unavailable).message} — restart the Copilot session, or reinstall the ${run.pluginName} plugin, then run again`, { phase, cause: 'infrastructure' })

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

// ── Progress: what the canvas shows while the run works ───────────────────────────────────────

/**
 * @typedef {{ version: 1, run: { startedAt: string, endedAt?: string, phase: string, status: string, mode: string, detail?: string,
 *     problems?: string[], agents?: Record<string, { agent: string, since: string }> },
 *   stories: Record<string, { step: string, attempt?: number, at: string }> }} Progress
 */

/** The problems of a stopped run the canvas lists; the run's answer keeps them all. */
const MAX_PROBLEMS_SHOWN = 50

/** @param {Run} run */
const progressPath = (run) => join(run.dir, 'progress.json')

/** Writes the progress once the previous write ended: parallel agents never interleave it. @param {Run} run */
const flushProgress = (run) => {
  const text = `${JSON.stringify(run.progress, null, 2)}\n`
  run.progressWrite = run.progressWrite.then(async () => {
    await mkdir(run.dir, { recursive: true })
    const temporary = `${progressPath(run)}.tmp`
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, progressPath(run))
  })
  return run.progressWrite
}

/**
 * Where one story stands now: writing, written, refused, held, reviewing, rework, approved, splitting.
 * @param {Run} run @param {string} id @param {string} step @param {number} [attempt]
 */
const track = (run, id, step, attempt) => {
  run.progress.stories[id] = { step, ...(attempt ? { attempt } : {}), at: run.now() }
  return flushProgress(run)
}

/**
 * From here on, each phase the run enters is also written to the progress the canvas reads.
 * @param {WorkflowContext} ctx @param {Run} run
 */
const startProgress = async (ctx, run) => {
  const host = ctx.phase
  ctx.phase = (title) => {
    host?.(title)
    run.progress.run.phase = title
    void flushProgress(run)
  }
  await flushProgress(run)
}

/** @param {Run} run @param {string} status @param {string} [detail] */
const endProgress = async (run, status, detail, problems) => {
  const { agents, ...rest } = run.progress.run
  run.progress.run = { ...rest, status, endedAt: run.now(), ...(detail ? { detail } : {}), ...(problems?.length ? { problems: problems.slice(0, MAX_PROBLEMS_SHOWN) } : {}) }
  await flushProgress(run)
}

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
  if (run.listed === null) return `${run.pluginName}:${id}`
  return run.listed.find((name) => name === `${run.pluginName}:${id}`) ?? run.listed.find((name) => name === id || name.endsWith(`:${id}`)) ?? `${run.pluginName}:${id}`
}

/** @param {WorkflowContext} ctx @param {Run} run @param {string} id @param {string} label @param {string} prompt */
/**
 * Every agent is dispatched here: the directory of the file its brief names exists before it runs.
 * @param {WorkflowContext} ctx @param {Run} run @param {string} id @param {string} label @param {string} prompt
 */
const dispatch = async (ctx, run, id, label, prompt) => {
  if (run.unavailable) throw run.unavailable
  const output = outputOf(prompt)
  if (output) await ensureDir(ctx, run, dirname(output))
  const agent = agentOf(run, id)
  const answer = await run.slot(async () => {
    if (run.unavailable) throw run.unavailable
    const working = run.progress.run.agents ??= {}
    working[label] = { agent: id, since: run.now() }
    void flushProgress(run)
    try {
      return await ctx.agent(`${prompt}\n\nPass: ${run.salt}`, { label, agent })
    } finally {
      delete working[label]
      void flushProgress(run)
    }
  })
  if (answer === null || answer === undefined || (typeof answer === 'string' && !answer.trim())) {
    run.unavailable = new AgentUnavailable(id, agent, label)
    ctx.log(run.unavailable.message)
    throw run.unavailable
  }
  return answer
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
  const framing = await frame(ctx, run)
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await dispatch(ctx, run, 'backlog-slicer', `slice · attempt ${attempt}`, sliceBrief({
      prd: run.prd, inventory: join(run.dir, 'inventory.json'), output, language: run.inventory.language, attempt, problems,
      framing: framing ? framingLines(framing) : [],
    }))
    const checked = await checkedMap(ctx, run)
    problems = checked.problems
    ctx.log(`story map attempt ${attempt}: ${problems.length ? `${problems.length} problem(s)` : 'checks pass'}`)
    if (!problems.length) return checked
  }
  return { problems }
}

/**
 * FRAME: the questions answered before the first slice. The code asks what the PRD shows; the
 * slicer adds what only a reader sees — unless the run approves without a human (`approve`).
 * The run pauses until the product owner answers in the canvas; an unanswered question takes
 * its recommendation. `frame: false` skips it.
 * @param {WorkflowContext} ctx @param {Run} run
 * @returns {Promise<import('./framing.mjs').Framing | null>}
 */
const frame = async (ctx, run) => {
  if (ctx.args.frame === false) return null
  const path = join(run.dir, 'framing.json')
  let framing = framingOf((await readJson(path)).value)
  if (!framing) {
    ctx.phase?.('FRAME')
    const questions = prdQuestions(run.inventory, run.prdText)
    framing = { version: 1, questions: [...questions, ...(ctx.args.approve === true ? [] : await askSlicer(ctx, run, questions))], answers: {} }
    await write(path, `${JSON.stringify(framing, null, 2)}\n`)
    ctx.log(`framing: ${framing.questions.length} question(s) in ${display(run, path)}`)
  }
  if (unanswered(framing).length && ctx.args.approve !== true) {
    await pause(ctx, run, 'framing-answered')
    framing = framingOf((await readJson(path)).value) ?? framing
  }
  ctx.phase?.('SLICE')
  return framing
}

/** @param {WorkflowContext} ctx @param {Run} run @param {import('./framing.mjs').FramingQuestion[]} asked */
const askSlicer = async (ctx, run, asked) => {
  const output = join(run.dir, 'framing-questions.json')
  await dispatch(ctx, run, 'backlog-slicer', 'frame', frameBrief({
    prd: run.prd, inventory: join(run.dir, 'inventory.json'), output, language: run.inventory.language, asked: asked.map((q) => q.question),
  }))
  const read = await readJson(output)
  await rm(output, { force: true })
  return 'value' in read ? slicerQuestions(read.value) : []
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
  'review.json', 'slice-proposals.json', 'corrections.json', 'answers.json', 'progress.json', 'framing.json', 'stories', 'plans', 'reviews', 'corrections']))

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
  const { file, changes } = normalizeStory(read.value, planned, answers, run.reasons?.[planned.id] ?? {})
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
    await track(run, planned.id, 'writing', attempt)
    await dispatch(ctx, run, 'story-writer', `write ${planned.id} · attempt ${attempt}`, storyBrief({
      prd: run.prd, map: join(run.dir, 'story-map.json'), story: planned.id, epic: planned.epic, output: storyPath(run, planned.id),
      language: run.inventory.language, attempt, problems: last.problems, findings: attempt === first ? findings : [],
      answers: await pendingAnswers(run, planned.id),
    }))
    const read = await readStory(run, planned, answers)
    await track(run, planned.id, read.file ? 'written' : needsCorrection(read) ? 'held' : 'refused', attempt)
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
    if (!run.touched) await track(run, planned.id, 'written')
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
    for (const id of pending) if (review.approved.has(id) || review.held.has(id)) await track(run, id, review.approved.has(id) ? 'approved' : 'held', attempt)
    ctx.log(`${epic.id} review attempt ${attempt}: ${review.verdict}, ${review.approved.size} of ${epic.stories.length} stories approved`)
    if (attempt === MAX_ATTEMPTS) break
    for (const id of pending.filter((p) => review.findings.get(p)?.length && !review.approved.has(p) && !review.held.has(p))) await track(run, id, 'rework', attempt)
    await rework(ctx, run, epic, state, pending.filter((id) => review.findings.get(id)?.length), review.findings)
  }
  const result = resultOf(run, epic, state, review)
  await saveVerdicts(run, epic, state, result, saved)
  for (const id of result.ready) if (!run.touched || run.touched.has(id) || run.progress.stories[id]) await track(run, id, 'approved')
  for (const id of Object.keys(result.notReady)) if (!run.touched || run.touched.has(id)) await track(run, id, state.get(id)?.file ? 'held' : 'refused')
  return result
}


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
  for (const id of pending) await track(run, id, 'reviewing', attempt)
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
  const fingerprints = Object.fromEntries(pending.map((id) => [id, fingerprintOf(files.get(id))]))
  await write(join(reviews, `discuss-review-${base + attempt}.json`), `${JSON.stringify({ ...review, stories, fingerprints, dismissed: triaged.dismissed, slice: triaged.slice, discarded: judged.discarded }, null, 2)}\n`)
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
const readCorrections = async (run) => {
  const raw = (await readJson(correctionsPath(run))).value
  return { ...correctionsOf(raw), ...(raw?.stories ? { stories: raw.stories } : {}) }
}

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
  const resumed = corrections.session?.status === 'running'
  const round = (corrections.session?.round ?? 0) + (resumed ? 0 : 1)
  corrections.session = resumed ? { ...corrections.session, applied: [], failed: {} }
    : { status: 'running', round, startedAt: run.now(), applied: [], failed: {}, touched: [], verdicts: {} }
  run.verify = []
  run.salt = sessionSalt(run, round, accepted, answered)
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
 * The salt of a correction session's briefs: the runtime replays an agent whose brief it has
 * already seen in this run, so every new session — counted in corrections.json, whatever the
 * decisions say, even a status edited by hand — makes new briefs, or the writer would never run.
 * A session resumed while running keeps its round, so its agents are not run twice.
 * @param {Run} run @param {number} round @param {import('./corrections.mjs').Decision[]} accepted @param {string[]} answered
 */
const sessionSalt = (run, round, accepted, answered) => sha256([
  run.pass, `round ${round}`, ...accepted.map((d) => `${d.option.id}@${d.at}`).sort(),
  ...answered.flatMap((id) => Object.entries(run.answers[id] ?? {}).map(([q, a]) => `${id}/${q}@${a.at}`)).sort(),
].join('|')).slice(0, 12)

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
    if (decision.option.structural) {
      Object.assign(corrections.decisions[id], { status: 'applied', appliedAt: run.now() })
      corrections.session.applied.push(id)
    } else run.verify?.push(await verifyTarget(run, decision))
  } catch (error) {
    if (isHostStop(ctx, error)) throw error
    if (error instanceof InfraError) {
      corrections.decisions[id].error = `infrastructure (${error.code})`
      corrections.session.failed[id] = `infrastructure (${error.code}) — the decision stays accepted, run the session again`
      ctx.log(`correction ${id}: infrastructure failure (${error.code}), kept accepted to replay`)
      return
    }
    const reason = error instanceof CorrectionFailed ? error.message : 'the correction could not be applied'
    Object.assign(corrections.decisions[id], { status: 'failed', error: reason })
    corrections.session.failed[id] = reason
  }
}

/**
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./corrections.mjs').Decision} decision @param {any} session
 */
const applyOption = async (ctx, run, { story, option, comment }, session) => {
  const said = comment ? ` Product owner: ${comment}` : ''
  if (SPLIT_KINDS.has(option.kind)) {
    const { parts, dependents } = await splitParts(ctx, run, story, option, comment)
    const { map, ids } = applySplit(run.map, story, parts, { dependents })
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
    const reason = reasonOf(run, option)
    run.reasons = { ...run.reasons, [story]: { ...run.reasons?.[story], ...Object.fromEntries((option.add ?? []).map((id) => [id, reason])) } }
    touch(run.touched, story, `${option.instruction}${said}`)
  } else touch(run.touched, story, comment ? `PRODUCT OWNER INSTRUCTION — it takes priority over everything else: ${comment}\n  (${option.title}. ${option.instruction})` : option.instruction)
}

/**
 * Why a story waits on the dependency a correction declares: the finding that asked for it, never empty.
 * @param {Run} run @param {import('./corrections.mjs').Option} option
 */
const reasonOf = (run, option) => {
  const text = option.reason ?? /Finding: (?:G\d+: )?([\s\S]+)$/.exec(option.instruction)?.[1]
  return text?.trim() || say(run.inventory.language, 'declaredReason', { add: option.add ?? [] })
}

/** The rules a correction must lift: the checks its finding came from; for a regroup, the criteria count. */
const CHECKED = Object.freeze(['criteria-too-many', 'integrations-many', 'too-small'])

/**
 * What to verify once the writer ran: the file must change, and the checks the finding came from
 * must no longer hold.
 * @param {Run} run @param {import('./corrections.mjs').Decision} decision
 */
const verifyTarget = async (run, { story, finding, option }) => {
  const read = await readJson(storyPath(run, story))
  const sources = (await readCorrections(run)).stories?.[story]?.findings?.find((f) => f.id === finding)?.sources ?? []
  const rules = [...new Set([
    ...sources.map((s) => s.replace(/^check:/, '')).filter((r) => CHECKED.includes(r)),
    ...(option.kind === 'regroup-criteria' ? ['criteria-too-many'] : []),
  ])]
  return { decision: option.id, story, before: 'value' in read ? fingerprintOf(read.value) : null, rules }
}

/**
 * Once the touched stories are written: a non-structural correction is applied only if its story
 * file changed and no longer fails the checks it was meant to lift; otherwise it fails, with why.
 * @param {WorkflowContext} ctx @param {Run} run
 */
const verifyCorrections = async (ctx, run) => {
  if (!run.verify?.length) return
  const corrections = await readCorrections(run)
  for (const target of run.verify) {
    const read = await readJson(storyPath(run, target.story))
    const planned = storiesOf(run.map).find((s) => s.id === target.story)
    const error = 'value' in read && planned ? stillFailing(run, read.value, { ...planned, epic: epicIdOf(run, target.story) }, target) : `${target.story}.json cannot be read`
    const decision = corrections.decisions[target.decision]
    if (!decision) continue
    if (error) {
      Object.assign(decision, { status: 'failed', error })
      corrections.session.failed[target.decision] = error
    } else {
      Object.assign(decision, { status: 'applied', appliedAt: run.now() })
      corrections.session.applied.push(target.decision)
    }
  }
  await saveCorrections(run, corrections)
  ctx.log(`corrections verified: ${run.verify.filter((t) => corrections.decisions[t.decision]?.status === 'applied').length} applied, ${run.verify.filter((t) => corrections.decisions[t.decision]?.status === 'failed').length} failed`)
}

/** @param {Run} run @param {string} id */
const epicIdOf = (run, id) => /** @type {string} */ (run.map.epics.find((e) => e.stories.some((s) => s.id === id))?.id)

/**
 * Why a correction did not take, or null.
 * @param {Run} run @param {any} file @param {any} planned @param {{ before: string | null, rules: string[] }} target
 */
const stillFailing = (run, file, planned, { before, rules }) => {
  if (before !== null && fingerprintOf(file) === before) return 'the story file was not rewritten: the correction was not applied'
  const found = new Set(checkStory(file, planned, knownOf(run)).details.map((d) => d.rule))
  if (rules.includes('integrations-many') && integrationsOf(file, { examples: true }).length > 1) found.add('integrations-many')
  const left = rules.filter((rule) => found.has(rule))
  return left.length ? `the rewritten story still fails ${left.join(', ')}` : null
}

/**
 * The parts of an accepted split, named by the slicer and checked by the code.
 * @param {WorkflowContext} ctx @param {Run} run @param {string} story @param {import('./corrections.mjs').Option} option @param {string} [comment]
 */
const splitParts = async (ctx, run, story, option, comment) => {
  const original = storiesOf(run.map).find((s) => s.id === story)
  if (!original) throw new CorrectionFailed(`${story} is no story of the map`)
  const output = join(run.dir, 'corrections', `${story}.split.json`)
  let problems = []
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await track(run, story, 'splitting', attempt)
    await dispatch(ctx, run, 'backlog-slicer', `split ${story} · attempt ${attempt}`, splitBrief({
      prd: run.prd, map: join(run.dir, 'story-map.json'), story, output, language: run.inventory.language, attempt, problems, option, comment,
    }))
    const read = await readJson(output)
    if ('error' in read && INFRA_CODES.has(read.code ?? '')) throw new InfraError(`${story}.split.json cannot be read: ${read.error}`, /** @type {string} */ (read.code))
    const waiting = storiesOf(run.map).filter((s) => s.after.includes(story)).map((s) => s.id)
    problems = 'error' in read ? [`${story}.split.json cannot be read: ${read.error}`] : splitProblems(original, read.value, option.impact.parts.length, waiting)
    if (!problems.length) return { parts: /** @type {import('./corrections.mjs').SplitPart[]} */ (read.value.stories), dependents: read.value.dependents ?? {} }
  }
  throw new CorrectionFailed(`the split of ${story} was refused ${MAX_ATTEMPTS} times: ${problems.join('; ')}`)
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
  const proposals = proposeCorrections({ map: run.map, files: loaded.raw.files, language: run.inventory.language, known: knownOf(run), reviews: loaded.raw.reviews, answers: run.answers, contents: loaded.raw.contents })
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
/**
 * The plan of the epics reviewed so far: an epic still under way (`undefined`) holds its stories
 * as in progress, one whose elaboration failed (`null`) as failed.
 * @param {Run} run @param {import('./story-map.mjs').MapEpic[]} epics @param {Array<EpicResult | null | undefined>} results
 */
const planOf = (run, epics, results) => {
  const files = new Map()
  const held = new Map()
  const language = run.inventory.language
  for (const story of storiesOf(run.map)) held.set(story.id, [say(language, 'notElaborated')])
  epics.forEach((epic, index) => {
    const result = results[index]
    for (const story of epic.stories) held.set(story.id, [result === undefined ? say(language, 'inProgress') : say(language, 'elaborationFailed', { epic: epic.id })])
    if (!result) return
    for (const id of result.ready) held.delete(id)
    for (const [id, reasons] of Object.entries(result.notReady)) held.set(id, reasons)
    for (const [id, file] of Object.entries(result.files)) files.set(id, file)
  })
  const notReady = holdBackDependents(run.map, held, language)
  const ready = new Set(storiesOf(run.map).map((s) => s.id).filter((id) => !notReady.has(id)))
  const backlog = { slug: run.slug, prd: display(run, run.prd), repo: run.repo, language, prdUrl: run.prdUrl, map: run.map, files, ready, notReady }
  return { plan: planOperations(backlog), backlog, notReady }
}

/** @param {Run} run @param {import('./handoff.mjs').Plan} plan */
const writePlan = (run, plan) => write(join(run.dir, 'plan.json'), `${JSON.stringify({ ...plan, repo: run.repo, notReady: Object.fromEntries(plan.notReady) }, null, 2)}\n`)

/**
 * As soon as an epic is reviewed, its ready stories can be reviewed and created in the canvas
 * while the other epics are still being elaborated: plan.json holds what is ready so far.
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapEpic[]} epics @param {Array<EpicResult | null | undefined>} results
 */
const planSoFar = async (ctx, run, epics, results) => {
  const { plan } = planOf(run, epics, results)
  if (!plan.issues.length || planProblems(plan).length) return
  run.planWrite = (run.planWrite ?? Promise.resolve()).then(() => writePlan(run, plan))
  await run.planWrite
  ctx.log(`plan so far: ${plan.issues.filter((i) => i.kind === 'story').length} stories ready to create in the canvas`)
}

const writeHandoff = async (ctx, run, epics, results) => {
  const { plan, backlog, notReady } = planOf(run, epics, results)
  const problems = planProblems(plan)
  if (problems.length) return blocked(run, 'HANDOFF', problems)
  if (!plan.issues.length) return outcome(run, 'blocked', 'no story passed the planning review: nothing to publish', { phase: 'REVIEW', notReady: Object.fromEntries(notReady) })
  for (const [name, text] of Object.entries(renderHandoffFiles(plan, backlog, { now: run.now() }))) {
    if (name === 'handoff.md' && (await sameHandoff(join(run.handoffDir, name), text))) continue
    await write(join(run.handoffDir, name), text)
  }
  if (run.planWrite) await run.planWrite
  await writePlan(run, plan)
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
const publishHandoff = async (ctx, run, plan, { cwd, gh = ghCli(cwd ?? undefined, { signal: ctx.signal }) }) => {
  const dryRun = ctx.args.dryRun === true
  if (!run.repo) return outcome(run, 'refused', 'no repository to publish to: pass args.repo (owner/repo)')
  let report
  try {
    report = await publish({ plan, repo: run.repo, github: createGitHub(gh), dryRun, once: (key, produce) => ctx.step(`publish-${run.slug}-${key}`, produce) })
  } catch (error) {
    if (isHostStop(ctx, error)) throw error
    const reason = error instanceof PublishBlocked ? error.message : 'the publication stopped on an unexpected error; resume the run to retry'
    return outcome(run, 'blocked', reason, { phase: 'PUBLISH', code: 'publish-blocked' })
  }
  await write(join(run.handoffDir, dryRun ? 'handoff-dryrun.md' : 'handoff-logs.md'), renderHandoffLogs(report, { slug: run.slug, now: run.now(), dryRun }))
  if (!dryRun) await writePublished(run.cwd, run.slug, publishedItems(plan, report, run.repo))
  const created = report.operations.filter((o) => o.status === 'created').length
  ctx.log(`${run.repo}: ${created} created, ${report.failed} failed, ${report.skipped} skipped${dryRun ? ' (dry run)' : ''}`)
  const status = report.failed + report.skipped ? 'blocked' : dryRun ? 'simulated' : 'published'
  return outcome(run, status, `${created} issues created on ${run.repo}${status === 'blocked' ? `; resume the run to retry: ${display(run, join(run.handoffDir, 'handoff-logs.md'))}` : ''}`,
    { phase: 'PUBLISH', mapping: report.mapping, failed: report.failed, skipped: report.skipped, notReady: Object.fromEntries(plan.notReady) })
}
