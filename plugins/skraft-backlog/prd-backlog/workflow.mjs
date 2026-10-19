// The `skraft-prd-backlog` dynamic workflow: from an approved PRD to a reviewed GitHub backlog.
//
//   INVENTORY  the PRD's requirement ids, read by a script
//   SLICE      the slicer writes the story map; a script checks it; a human approves it (pause)
//   ELABORATE  one story writer per story, in parallel; a script checks each story file
//   REVIEW     the four planning lenses per epic; review-verdict.mjs decides; rework at most twice
//   HANDOFF    the HVE planning files; a human checks the review box (pause)
//   PUBLISH    issues, sub-issues, blocked-by links and milestones, idempotent
//
// The workflow decides nothing a script or a human decides: every verdict comes from a check.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { computeVerdict, parseLensResult } from '../skills/backlog-review-lenses/scripts/review-verdict.mjs'
import { LENSES, lensBrief, sliceBrief, storyBrief } from './briefs.mjs'
import { holdBackDependents, isReviewed, planOperations, planProblems, renderHandoffFiles } from './handoff.mjs'
import { inventoryOf } from './prd-inventory.mjs'
import { createGitHub, ghCli, publish, renderHandoffLogs } from './publish.mjs'
import { renderAcDraft, renderStoriesFile, renderStoryMap } from './render.mjs'
import { checkStory } from './story.mjs'
import { checkStoryMap, storiesOf } from './story-map.mjs'

export const MAX_ATTEMPTS = 3

export const PRD_BACKLOG_META = Object.freeze({
  name: 'skraft-prd-backlog',
  description:
    'Turn an approved PRD into a reviewed GitHub backlog: epics as tracking issues, INVEST stories that pass the ' +
    'Definition of Ready as sub-issues, blocked-by links and milestones. Pauses twice for a human: after the story ' +
    'map, and on the handoff review box. args: { prd: path of the PRD, slug?: kebab-case scope (default: the PRD file ' +
    'name), repo?: owner/repo to publish to (default: the repository of the working directory), epics?: epic ids to ' +
    'elaborate (default: all), approve?: true to skip the story-map pause, dryRun?: true to simulate the publication, ' +
    'agentIds?: { [agent file id]: session agent id }, models?: { [agent file id]: Copilot model name } }.',
  phases: Object.freeze(['INVENTORY', 'SLICE', 'ELABORATE', 'REVIEW', 'HANDOFF', 'PUBLISH'].map((title) => Object.freeze({ title }))),
  argsSchema: Object.freeze({
    type: 'object',
    required: ['prd'],
    properties: Object.freeze({
      prd: { type: 'string' }, slug: { type: 'string' }, repo: { type: 'string' },
      epics: { type: 'array', items: { type: 'string' } },
      approve: { type: 'boolean' }, dryRun: { type: 'boolean' },
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
  if (ctx.args.approve !== true) await ctx.pause('story-map-approved')
  const approved = await approvedMap(run)
  if (approved.problems.length) return blocked(run, 'SLICE', approved.problems)
  run.map = /** @type {import('./story-map.mjs').StoryMap} */ (approved.map)
  if (unknownEpics(run).length) return outcome(run, 'refused', `args.epics: ${unknownEpics(run).join(', ')} is no epic of the story map`)
  ctx.phase?.('ELABORATE')
  const epics = selectedEpics(run)
  const results = await ctx.parallel(epics.map((epic) => () => elaborateAndReview(ctx, run, epic)))
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
 * }} Run epics: the epics to elaborate, null for all
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
  try { return { value: JSON.parse(await readFile(path, 'utf8')) } } catch (error) { return { error: /** @type {Error} */ (error).message } }
}

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
const dispatch = (ctx, run, id, label, prompt) => ctx.agent(prompt, {
  label, agent: agentOf(run, id), ...(run.models[id] ? { model: run.models[id] } : {}),
})

// ── SLICE ───────────────────────────────────────────────────────────────────────────────────────

/** @param {WorkflowContext} ctx @param {Run} run */
const slice = async (ctx, run) => {
  const output = join(run.dir, 'story-map.json')
  let problems = []
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await dispatch(ctx, run, 'backlog-slicer', `slice · attempt ${attempt}`, sliceBrief({
      prd: run.prd, inventory: join(run.dir, 'inventory.json'), output, language: run.inventory.language, attempt, problems,
    }))
    const checked = await checkedMap(run)
    problems = checked.problems
    ctx.log(`story map attempt ${attempt}: ${problems.length ? `${problems.length} problem(s)` : 'checks pass'}`)
    if (!problems.length) return checked
  }
  return { problems }
}

/** The story map on disk, checked, and rendered for the reviewer. @param {Run} run */
const checkedMap = async (run) => {
  const read = await readJson(join(run.dir, 'story-map.json'))
  if ('error' in read) return { problems: [`story-map.json cannot be read: ${read.error}`], map: null }
  const findings = checkStoryMap(read.value, run.inventory)
  if (!findings.problems.length) await write(join(run.dir, 'story-map.md'), renderStoryMap(read.value, { prd: display(run, run.prd), findings }))
  return { problems: findings.problems, map: /** @type {import('./story-map.mjs').StoryMap} */ (read.value) }
}

/** On resume the human may have edited the map: it is checked again, as it reads now. @param {Run} run */
const approvedMap = (run) => checkedMap(run)

/** @param {Run} run */
const selectedEpics = (run) => (run.epics ? run.map.epics.filter((e) => /** @type {string[]} */ (run.epics).includes(e.id)) : run.map.epics)

/** @param {Run} run @returns {string[]} */
const unknownEpics = (run) => (run.epics ?? []).filter((id) => !run.map.epics.some((e) => e.id === id))

// ── ELABORATE and REVIEW ────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ epic: string, verdict: string, ready: string[], notReady: Record<string, string[]>,
 *   files: Record<string, import('./story.mjs').StoryFile> }} EpicResult
 */

/** @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapEpic} epic @returns {Promise<EpicResult>} */
const elaborateAndReview = async (ctx, run, epic) => {
  const known = new Set(run.inventory.requirements.map((r) => r.id))
  const written = await ctx.parallel(epic.stories.map((story) => () => writeStory(ctx, run, { ...story, epic: epic.id }, known, [], 1)))
  const state = new Map(epic.stories.map((story, index) => [story.id, written[index] ?? { file: null, problems: ['the story writer failed'], attempt: 1 }]))
  let verdict = 'NEEDS_REWORK'
  let findings = []
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const review = await reviewEpic(ctx, run, epic, state, attempt)
    verdict = review.verdict
    findings = review.findings
    ctx.log(`${epic.id} review attempt ${attempt}: ${verdict}`)
    if (verdict === 'APPROVED' || attempt === MAX_ATTEMPTS) break
    if (findings.length) await rework(ctx, run, epic, state, findings, known)
  }
  return resultOf(epic, state, verdict, findings)
}

/**
 * One story, written then checked; refused files are sent back with their problems.
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapStory & { epic: string }} planned
 * @param {Set<string>} known @param {string[]} findings @param {number} first the first attempt number of this round
 */
const writeStory = async (ctx, run, planned, known, findings, first) => {
  const output = join(run.dir, 'stories', `${planned.id}.json`)
  let problems = []
  let attempt = first
  for (; attempt < first + MAX_ATTEMPTS; attempt += 1) {
    await dispatch(ctx, run, 'story-writer', `write ${planned.id} · attempt ${attempt}`, storyBrief({
      prd: run.prd, map: join(run.dir, 'story-map.json'), story: planned.id, epic: planned.epic, output,
      language: run.inventory.language, attempt, problems, findings: attempt === first ? findings : [],
    }))
    const read = await readJson(output)
    problems = 'error' in read ? [`${planned.id}.json cannot be read: ${read.error}`] : checkStory(read.value, planned, known).problems
    if (!problems.length) return { file: /** @type {import('./story.mjs').StoryFile} */ (read.value), problems, attempt }
  }
  return { file: null, problems, attempt: attempt - 1 }
}

/**
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapEpic} epic
 * @param {Map<string, { file: import('./story.mjs').StoryFile | null, problems: string[], attempt: number }>} state
 * @param {number} attempt
 */
const reviewEpic = async (ctx, run, epic, state, attempt) => {
  const files = new Map([...state].filter(([, s]) => s.file).map(([id, s]) => [id, /** @type {import('./story.mjs').StoryFile} */ (s.file)]))
  if (files.size < epic.stories.length) {
    return { verdict: 'REJECTED', findings: [...state].filter(([, s]) => !s.file).map(([id, s]) => ({ story: id, description: s.problems.join('; ') })) }
  }
  const plans = join(run.dir, 'plans')
  const storiesPath = join(plans, `stories-${epic.id}.md`)
  await write(storiesPath, renderStoriesFile(epic, run.map, files))
  const drafts = []
  for (const file of files.values()) {
    const path = join(plans, `ac-draft-${file.id}.md`)
    await write(path, renderAcDraft(file))
    drafts.push(path)
  }
  const reviews = join(run.dir, 'reviews', epic.id)
  const answers = await ctx.parallel(LENSES.map((lens) => () => dispatch(ctx, run, lens.agent, `${epic.id} · ${lens.name} · attempt ${attempt}`,
    lensBrief({ lens, epic: epic.id, stories: storiesPath, drafts, attempt }))))
  const results = []
  for (const [index, lens] of LENSES.entries()) {
    const text = answers[index] ?? ''
    await write(join(reviews, `discuss-lens-${lens.name}-${attempt}.yaml`), `${text}\n`)
    try { results.push(parseLensResult(text)) } catch (error) { results.push({ lens: lens.name, verdict: 'unparseable', defects: [], error: /** @type {Error} */ (error).message }) }
  }
  const review = computeVerdict('discuss', results)
  await write(join(reviews, `discuss-review-${attempt}.json`), `${JSON.stringify(review, null, 2)}\n`)
  const findings = Object.values(review.lenses).flatMap((lens) => lens.findings).filter((f) => ['medium', 'high', 'blocker'].includes(f.severity))
  return { verdict: review.verdict, findings }
}

/**
 * The stories the blocking findings name are written again with those findings; a finding that
 * names no story of the epic sends every story back.
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapEpic} epic
 * @param {Map<string, { file: import('./story.mjs').StoryFile | null, problems: string[], attempt: number }>} state
 * @param {Array<{ story?: string, description?: string, suggestion?: string, gate?: string }>} findings
 * @param {Set<string>} known
 */
const rework = async (ctx, run, epic, state, findings, known) => {
  const named = new Set(findings.map((f) => String(f.story ?? '')).filter((id) => state.has(id)))
  const targets = named.size && findings.every((f) => state.has(String(f.story ?? ''))) ? epic.stories.filter((s) => named.has(s.id)) : epic.stories
  const rewritten = await ctx.parallel(targets.map((story) => () => {
    const own = findings.filter((f) => !state.has(String(f.story ?? '')) || f.story === story.id)
      .map((f) => `${f.gate ? `${f.gate}: ` : ''}${f.description ?? ''}${f.suggestion ? ` — ${f.suggestion}` : ''}`)
    return writeStory(ctx, run, { ...story, epic: epic.id }, known, own, /** @type {{ attempt: number }} */ (state.get(story.id)).attempt + 1)
  }))
  targets.forEach((story, index) => { if (rewritten[index]) state.set(story.id, rewritten[index]) })
}

/**
 * @param {import('./story-map.mjs').MapEpic} epic
 * @param {Map<string, { file: import('./story.mjs').StoryFile | null, problems: string[] }>} state
 * @param {string} verdict @param {Array<{ story?: string, description?: string }>} findings
 * @returns {EpicResult}
 */
const resultOf = (epic, state, verdict, findings) => {
  const ready = verdict === 'APPROVED' ? epic.stories.filter((s) => state.get(s.id)?.file).map((s) => s.id) : []
  const notReady = {}
  for (const story of epic.stories.filter((s) => !ready.includes(s.id))) {
    const own = findings.filter((f) => f.story === story.id).map((f) => f.description ?? '')
    notReady[story.id] = state.get(story.id)?.problems.length ? /** @type {string[]} */ (state.get(story.id)?.problems)
      : own.length ? own : [`the planning review of ${epic.id} ended ${verdict}`]
  }
  const files = Object.fromEntries([...state].filter(([, s]) => s.file).map(([id, s]) => [id, /** @type {import('./story.mjs').StoryFile} */ (s.file)]))
  return { epic: epic.id, verdict, ready, notReady, files }
}

// ── HANDOFF and PUBLISH ─────────────────────────────────────────────────────────────────────────

/**
 * @param {WorkflowContext} ctx @param {Run} run @param {import('./story-map.mjs').MapEpic[]} epics
 * @param {Array<EpicResult | null>} results
 */
const writeHandoff = async (ctx, run, epics, results) => {
  const files = new Map()
  const held = new Map()
  for (const story of storiesOf(run.map)) held.set(story.id, ['its epic was not elaborated in this run'])
  epics.forEach((epic, index) => {
    const result = results[index]
    for (const story of epic.stories) held.set(story.id, [`the elaboration of ${epic.id} failed`])
    if (!result) return
    for (const id of result.ready) held.delete(id)
    for (const [id, reasons] of Object.entries(result.notReady)) held.set(id, reasons)
    for (const [id, file] of Object.entries(result.files)) files.set(id, file)
  })
  const notReady = holdBackDependents(run.map, held)
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
  await write(join(run.dir, 'plan.json'), `${JSON.stringify({ ...plan, notReady: Object.fromEntries(plan.notReady) }, null, 2)}\n`)
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
  const created = report.operations.filter((o) => o.status === 'created').length
  ctx.log(`${run.repo}: ${created} created, ${report.failed} failed, ${report.skipped} skipped${dryRun ? ' (dry run)' : ''}`)
  const status = report.failed + report.skipped ? 'blocked' : dryRun ? 'simulated' : 'published'
  return outcome(run, status, `${created} issues created on ${run.repo}${status === 'blocked' ? `; resume the run to retry: ${display(run, join(run.handoffDir, 'handoff-logs.md'))}` : ''}`,
    { phase: 'PUBLISH', mapping: report.mapping, failed: report.failed, skipped: report.skipped, notReady: Object.fromEntries(plan.notReady) })
}
