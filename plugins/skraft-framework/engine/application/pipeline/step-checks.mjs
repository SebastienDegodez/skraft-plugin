import { readOrName } from '../shared/workspace-reading.mjs'
import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { joinRelative, pathUnder } from '../../domain/config/relative-path.mjs'
import { readResult } from '../../domain/pipeline/agent-result.mjs'
import { breaksConvention, commitFailure, issueOf, judgeCommits } from '../../domain/pipeline/commits.mjs'
import { isFilled } from '../../domain/pipeline/outputs.mjs'
import { proseProblems, readProse } from '../../domain/reporting/pull-request-prose.mjs'
import { allowedPaths, makesCommits, rootFiles, trackingFolder } from '../../domain/pipeline/roles.mjs'
import { adrFailures } from '../decisions/adr-checks.mjs'
import { checkDesignRecords } from './design-records.mjs'
import { checkGherkinRecords } from './gherkin-records.mjs'
import { checkResearchRecords } from './research-records.mjs'
import { EJECTED } from '../workflow/called-workflows.mjs'
import { checkEvidence, redRunOf } from './evidence-checks.mjs'
import { planOf, scenarioFailures, scenarioJudging, scenarioRecord } from './scenario-checks.mjs'

/**
 * @typedef {import('../../domain/journal/run-state.mjs').Head} Head
 * @typedef {import('../../domain/pipeline/commits.mjs').JudgedCommit} JudgedCommit
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('../../domain/config/skraft-config.mjs').SkraftConfig} SkraftConfig
 * @typedef {'missing-outputs' | 'invalid-result' | 'design-records' | 'research-records' | 'gherkin-records' | 'scenarios' | 'pull-request-prose' | 'agent-blocked' | 'write-scope' | 'uncommitted' | 'adr-lifecycle' | 'commit-convention' | 'tdd' | 'evidence'} FailureCode
 * @typedef {{ repository: string, sha: string, subject: string, kind: string, verdict: string }} CheckedCommit
 * @typedef {{
 *   missing: string[], failures: string[], code: FailureCode | null, commits: CheckedCommit[],
 *   environment: null, uncommitted?: UncommittedFile[], scenario?: import('./scenario-checks.mjs').ScenarioRecord,
 *    evidence?: Array<{ run: number, gate: string, cwd: string, log: string, sha256: string }>, red?: boolean,
 * } | { commits: CheckedCommit[], environment: string }} StepCheck
 *   environment: why the machine could not check the step (Git failing); the step then stays
 *   open. uncommitted: the files in its scope the agent changed
 *   and left uncommitted, which the engine commits once the step is done: only an agent with no
 *   shell gets there, one with a shell is refused for them; absent when the agent is blocked.
 * @typedef {{ repository: string, file: string, path: string }} UncommittedFile
 *   file: relative to its repository; path: relative to the working copy.
 * @typedef {{
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   hasher: import('../ports/hasher.mjs').Hasher,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 *   clock: import('../ports/clock.mjs').Clock,
 *   agentRunner: import('../ports/agent-runner.mjs').AgentRunner,
 *   progress: import('../ports/pipeline-progress.mjs').PipelineProgress,
 * }} CheckDeps
 * @typedef {{ code: FailureCode, line: string }} Failure
 * @typedef {{ allowed: string[], roots: string[], engineFiles: string[] }} WriteScope
 * @typedef {{
 *   deps: CheckDeps, slug: string, config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 *   base: import('../config/bases.mjs').Base[], story: { issue?: number | null } | null,
 * }} CheckContext
 * @typedef {import('./scenario-checks.mjs').ScenarioPass} ScenarioPass
 * @typedef {{ heads: Head[], shas: string[] }} Carried
 *   what a delivery pass reopened after a block carries from the visits before it: the heads of
 *   the node's first visit, and the commits those visits' attempts made (commits.checked), so
 *   that a commit a person made while the run waited is no attempt's.
 */

/** Failure codes, the first one found naming the step's refusal. */
const PRIORITY = /** @type {const} */ (['missing-outputs', 'invalid-result', 'design-records', 'research-records', 'gherkin-records', 'scenarios', 'pull-request-prose', 'write-scope', 'uncommitted', 'adr-lifecycle', 'commit-convention', 'tdd', 'evidence'])

/**
 * Where each repository of the run stands before an attempt: its HEAD and the files already
 * changed, with their content's hash: the attempt answers for them only if it changes them again.
 * @param {Pick<CheckDeps, 'sourceControl' | 'workspace' | 'hasher'>} deps
 * @param {ReadonlyArray<{ repository: string }>} base the run's bases, one per repository folder
 * @returns {Promise<Head[]>}
 */
export const headsOf = async (deps, base) => {
  /** @type {Head[]} */
  const heads = []
  for (const repository of new Set(base.map((entry) => entry.repository))) {
    const sha = /** @type {string} */ (await deps.sourceControl.head(repository))
    // Stryker disable next-line ArrayDeclaration: dirty only filters the changed paths, and no changed path is a placeholder
    const changed = (await deps.sourceControl.changedFiles(repository, sha)) ?? []
    const dirty = []
    for (const path of changed.map((file) => joinRelative(repository, file))) dirty.push({ path, hash: await contentHash(deps, path) })
    heads.push({ repository, sha, dirty })
  }
  return heads
}

/**
 * The engine's own files as they stand, with their content's hash: what an attempt may not change.
 * @param {Pick<CheckDeps, 'workspace' | 'hasher'>} deps
 * @returns {Promise<Array<{ path: string, hash: string | null }>>}
 */
export const engineHashes = async (deps) => Promise.all(ENGINE_FILES.map(async (path) => ({ path, hash: await contentHash(deps, path) })))

/** The files of the engine no agent changes. */
const ENGINE_FILES = Object.freeze([CONFIG_FILE])

/**
 * The changed files without the engine files still as they were when the attempt started: a person
 * who changed one between attempts, or before a run resumed, does not make the agent answer for it.
 * @param {Pick<CheckDeps, 'workspace' | 'hasher'>} deps @param {string[]} touched
 * @param {Array<{ path: string, hash: string | null }> | undefined} before
 */
const withoutKeptEngineFiles = async (deps, touched, before) => {
  const kept = []
  for (const entry of before ?? []) if (entry.hash === (await contentHash(deps, entry.path))) kept.push(entry.path)
  return touched.filter((path) => !kept.includes(path))
}

/** @param {Pick<CheckDeps, 'workspace' | 'hasher'>} deps @param {string} path relative to the working copy */
const contentHash = async ({ workspace, hasher }, path) => {
  const text = await readOrName(workspace, path)
  return text === null ? null : hasher.sha256(text)
}

/**
 * What an agent's attempt left: its outputs, its result, the files it changed against its
 * write scope, the records its role keeps, and its commits against the commit
 * convention, the story's issue and the TDD cycle.
 * @param {CheckContext} context
 * @param {{
 *   role: import('../../domain/pipeline/roles.mjs').Role, outputs: string[], precreated: Array<string | null>, result: string,
 *   visitHeads: Head[], engineBefore?: Array<{ path: string, hash: string | null }>, scenario: ScenarioPass | null,
 *   evidence?: { folder: string, events: any[] } | null,
 * }} step evidence: where the attempt's runs are traced, for the role that delivers code; visitHeads: the heads when the pass started; engineBefore: the engine files as the attempt found them;
 *   scenario: the scenario the pass works on, null for none
 * @returns {Promise<StepCheck>}
 */
export const checkStep = async (context, step) => {
  const read = await readAttempt(context, step)
  if ('stop' in read) return withCommitsOfBlocked(context, step, read.stop)
  const commits = await checkCommits(context.deps, context, { ...step, plan: read.plan.plan })
  if (commits.environment !== null) return { ...environmentOnly(commits.environment), commits: commits.checked }
  const adr = await adrFailures(context.deps, { base: context.base, touched: read.touched })
  if (typeof adr === 'string') return { ...environmentOnly(adr), commits: commits.checked }
  const evidence = await evidenceOf(context, step)
  if (typeof evidence === 'string') return { ...environmentOnly(evidence), commits: commits.checked }
  const found = [...resultFailures(read.reading), ...read.records, ...read.plan.failures, ...read.prose, ...read.scope.failures, ...adrLines(adr), ...commits.found, ...evidence.failures]
  return { ...refusal(read.missing, found, commits), uncommitted: read.scope.uncommitted, scenario: commits.scenario, evidence: evidence.checked, ...(evidence.red === true ? { red: true } : {}) }
}

/**
 * The runs the REPL traced for an attempt that delivers code, checked against its final commit;
 * nothing for any other role. A string when the machine could not read Git.
 * @param {CheckContext} context @param {Parameters<typeof checkStep>[1]} step
 * @returns {Promise<{ failures: Failure[], checked: Array<{ run: number, gate: string, cwd: string, log: string, sha256: string }>, red?: boolean } | string>}
 */
const evidenceOf = async ({ deps, slug, config, base }, { role, evidence }) => {
  if (evidence === null || evidence === undefined) return { failures: [], checked: [] }
  if (role.tdd === 'red') return redEvidence(deps, { slug, folder: evidence.folder, events: evidence.events })
  if (role.tdd !== 'cycle') return { failures: [], checked: [] }
  const checked = await checkEvidence(deps, { slug, folder: evidence.folder, events: evidence.events, config, base })
  return checked.ok ? { failures: checked.failures, checked: checked.checked } : checked.reason
}

/**
 * The designer's traced run of the acceptance tests, labelled `red`: kept for the review, never required.
 * @param {any} deps @param {{ slug: string, folder: string, events: any[] }} attempt
 */
const redEvidence = async (deps, attempt) => {
  const red = await redRunOf(deps, attempt)
  return { failures: [], checked: red === null ? [] : [red], red: true }
}

/**
 * An attempt that stops blocked still made commits: they are recorded as the attempt's, so that
 * the pass a human reopens counts them and never a commit the person made meanwhile.
 * @param {CheckContext} context @param {Parameters<typeof checkStep>[1]} step @param {StepCheck} stop
 * @returns {Promise<StepCheck>}
 */
const withCommitsOfBlocked = async (context, step, stop) => {
  if (!('code' in stop) || stop.code !== 'agent-blocked') return stop
  const made = await checkCommits(context.deps, context, { ...step, plan: null })
  return { ...stop, commits: made.checked }
}

/**
 * What the attempt left before its commits: its outputs, its result, the files out of its scope
 * or left uncommitted, and the records its role keeps; the check that stops the step when one does.
 * @param {CheckContext} context
 * @param {Parameters<typeof checkStep>[1]} step
 * @returns {Promise<{ stop: StepCheck } | { missing: string[], reading: import('../../domain/pipeline/agent-result.mjs').ResultReading, touched: string[], scope: { failures: Failure[], uncommitted: UncommittedFile[] }, records: Failure[], prose: Failure[], plan: Awaited<ReturnType<typeof planOf>> }>}
 */
const readAttempt = async (context, step) => {
  const reading = readResult(await context.deps.files.read(context.slug, step.result))
  if (reading.ok && reading.result.status === 'blocked') return { stop: blockedBy(reading.result.summary) }
  const written = await readWritten(context, step)
  if ('stopped' in written) return { stop: environmentOnly(written.stopped) }
  return { ...written, reading }
}

/**
 * What the attempt wrote in the working copy, with no result file and no commit read: the outputs
 * it has not filled, the files out of its write scope or left uncommitted, the records its role
 * keeps, the prose it writes and the scenarios its plan names; `stopped` when the machine cannot
 * read one of them.
 * @param {CheckContext} context @param {Parameters<typeof checkStep>[1]} step
 */
const readWritten = async ({ deps, slug, config, base }, step) => {
  const missing = await missingOutputs(deps, slug, step)
  const changed = await touchedPaths(deps, step.visitHeads)
  if (typeof changed === 'string') return { stopped: changed }
  const touched = await withoutKeptEngineFiles(deps, changed, step.engineBefore)
  const scope = await scopeFailures(deps, step, { slug, config, touched })
  if (typeof scope === 'string') return { stopped: scope }
  const records = await keptRecords(deps, step, { slug, base, config })
  if (typeof records === 'string') return { stopped: records }
  return { missing, touched, scope, records, prose: await proseFailures(deps, slug, step, missing), plan: await planOf(deps, { slug, components: config.components }, step, missing) }
}

/**
 * The failures a submission's mechanical checks already find in what the attempt wrote, reading
 * no result file and no commit: its unfilled outputs, the files out of its write scope, the
 * records its role keeps, the prose it writes, the scenarios its plan names and the lifecycle of
 * the decisions it touched. `skraft precheck` answers them inside the attempt, so the agent
 * corrects them instead of paying a replay; the submission runs these same checks again, with the
 * result and the commits on top (#581).
 * @param {CheckContext} context @param {Parameters<typeof checkStep>[1]} step
 * @returns {Promise<{ ok: true, failures: Failure[] } | { ok: false, reason: string }>}
 */
export const writtenFailures = async (context, step) => {
  const read = await readWritten(context, step)
  if ('stopped' in read) return { ok: /** @type {const} */ (false), reason: read.stopped }
  const adr = await adrFailures(context.deps, { base: context.base, touched: read.touched })
  if (typeof adr === 'string') return { ok: /** @type {const} */ (false), reason: adr }
  return { ok: /** @type {const} */ (true), failures: foundIn(read, adr) }
}

/** Every failure of one reading, in the order the submission reports them. @param {any} read @param {string[]} adr @returns {Failure[]} */
const foundIn = (read, adr) => [
  ...read.missing.map((/** @type {string} */ path) => failure('missing-outputs', `missing ${path}`)),
  ...read.records, ...read.plan.failures, ...read.prose, ...read.scope.failures, ...adrLines(adr),
]

/**
 * What makes the pull request prose a role writes unfit for a description; nothing for another
 * role, or while its output is still missing.
 * @param {Pick<CheckDeps, 'files'>} deps @param {string} slug
 * @param {{ role: import('../../domain/pipeline/roles.mjs').Role, outputs: string[] }} step @param {string[]} missing
 * @returns {Promise<Failure[]>}
 */
const proseFailures = async ({ files }, slug, { role, outputs }, missing) => {
  if (!role.prose || missing.length > 0) return []
  const problems = proseProblems(readProse(/** @type {string} */ (await files.read(slug, outputs[0]))))
  return problems.map((line) => ({ code: /** @type {const} */ ('pull-request-prose'), line }))
}

/**
 * The records a role keeps, each failure under its own code: the DESIGN records of a role that
 * keeps them, the citations of a role whose research document the engine checks, the scenarios of
 * a role whose test plan names them — and only where a component describes its behaviour in
 * Gherkin: a repository whose tests are written without it is asked for no `.feature`.
 * @param {CheckDeps} deps @param {Parameters<typeof checkStep>[1]} step
 * @param {{ slug: string, base: import('../config/bases.mjs').Base[], config: SkraftConfig }} run
 * @returns {Promise<Failure[] | string>} a string: why the machine could not read them
 */
const keptRecords = async (deps, { role, precreated }, { slug, base, config }) => {
  if (role.records) return coded('design-records', await checkDesignRecords(deps, { slug, base }))
  if (role.citations) return researchRecords(deps, slug, precreated, config)
  if (role.scenarios && writesGherkin(config)) return coded('gherkin-records', await checkGherkinRecords(deps, { slug, components: config.components }))
  return []
}

/** @param {CheckDeps} deps @param {string} slug @param {Array<string | null>} precreated @param {SkraftConfig} config */
const researchRecords = async (deps, slug, precreated, config) => {
  const template = precreated[0]
  if (template === null || template === undefined) return 'RESEARCH template was not loaded'
  return coded('research-records', await checkResearchRecords(deps, { slug, template, roots: config.components.map(({ root }) => root) }))
}

/** Whether any component of the run describes its behaviour in Gherkin. @param {SkraftConfig} config */
const writesGherkin = ({ components }) => components.some(({ bdd }) => bdd === true)

/** @param {FailureCode} code @param {string[] | string} lines @returns {Failure[] | string} */
const coded = (code, lines) => (typeof lines === 'string' ? lines : lines.map((line) => ({ code, line })))

/** @param {string[]} lines @returns {Failure[]} */
const adrLines = (lines) => lines.map((line) => ({ code: /** @type {const} */ ('adr-lifecycle'), line }))

/** @param {string} reason @returns {StepCheck} */
const environmentOnly = (reason) => ({ commits: [], environment: reason })

/**
 * The outputs the attempt left as they were before it.
 * @param {Pick<CheckDeps, 'files'>} deps @param {string} slug
 * @param {{ outputs: string[], precreated: Array<string | null> }} step
 */
const missingOutputs = async ({ files }, slug, { outputs, precreated }) => {
  const texts = await Promise.all(outputs.map((path) => files.read(slug, path)))
  return outputs.filter((_, index) => !isFilled(texts[index], precreated[index]))
}

/** The agent said it cannot go on: its summary is the only refusal. @param {string} summary @returns {StepCheck} */
const blockedBy = (summary) => ({ missing: [], failures: [summary], code: 'agent-blocked', commits: [], environment: null })

/** @param {import('../../domain/pipeline/agent-result.mjs').ResultReading} reading @returns {Failure[]} */
const resultFailures = (reading) => (reading.ok ? [] : [{ code: 'invalid-result', line: `result ${reading.errors.join('; ')}` }])

/**
 * The files the attempt changed out of its write scope, then those in its scope it left
 * uncommitted outside the tracking folder: an agent with a shell commits its changes, refused
 * otherwise; the engine commits those of an agent with none, once its step is done.
 * @param {Pick<CheckDeps, 'sourceControl' | 'files'>} deps
 * @param {{ role: import('../../domain/pipeline/roles.mjs').Role, visitHeads: Head[] }} step
 * @param {{ slug: string, config: import('../../domain/config/skraft-config.mjs').SkraftConfig, touched: string[] }} attempt
 * @returns {Promise<{ failures: Failure[], uncommitted: UncommittedFile[] } | string>} a string: why Git cannot tell
 */
const scopeFailures = async (deps, { role, visitHeads }, { slug, config, touched }) => {
  const left = await uncommittedPaths(deps, visitHeads)
  if (typeof left === 'string') return left
  const folder = deps.files.folder
  const refused = outOfScope(touched, writeScopeOf(role, { slug, folder, config }))
  const kept = left.filter(({ path }) => touched.includes(path) && !refused.includes(path) && pathUnder(path, trackingFolder(slug, folder)) === null)
  const failures = [...refused.map((path) => failure('write-scope', `out of write scope: ${path}`)), ...(makesCommits(role) ? kept.map(uncommittedLine) : [])]
  return { failures, uncommitted: kept }
}

/** @param {UncommittedFile} file @returns {Failure} */
const uncommittedLine = ({ path }) => failure('uncommitted', `left uncommitted: ${path}; commit it or undo the change`)

/** @param {FailureCode} code @param {string} line @returns {Failure} */
const failure = (code, line) => ({ code, line })

/**
 * The files of every repository of the run that differ from its HEAD now; a string when Git
 * cannot tell.
 * @param {Pick<CheckDeps, 'sourceControl'>} deps @param {Head[]} visitHeads
 * @returns {Promise<UncommittedFile[] | string>}
 */
const uncommittedPaths = async ({ sourceControl }, visitHeads) => {
  const left = []
  for (const { repository } of visitHeads) {
    const head = /** @type {string} */ (await sourceControl.head(repository))
    const changed = await sourceControl.changedFiles(repository, head)
    if (changed === null) return `Git cannot list what changed in ${repository} since ${head}`
    left.push(...changed.map((file) => ({ repository, file, path: joinRelative(repository, file) })))
  }
  return left
}

/**
 * The step's refusal: every failure found, the code of the first one by priority.
 * @param {string[]} missing @param {Failure[]} found
 * @param {{ checked: CheckedCommit[] }} commits
 * @returns {StepCheck}
 */
const refusal = (missing, found, { checked }) => ({
  missing, failures: found.map((failure) => failure.line), code: refusalCode(missing, found), commits: checked, environment: null,
})

/** @param {string[]} missing @param {Failure[]} found @returns {FailureCode | null} */
const refusalCode = (missing, found) => PRIORITY.find((candidate) => (candidate === 'missing-outputs' ? missing.length > 0 : found.some((failure) => failure.code === candidate))) ?? null

/**
 * The files changed since the pass started, relative to the working copy; a string when Git
 * cannot tell.
 * @param {CheckDeps} deps @param {Head[]} visitHeads
 * @returns {Promise<string[] | string>}
 */
const touchedPaths = async (deps, visitHeads) => {
  /** @type {string[]} */
  const touched = []
  for (const head of visitHeads) {
    const since = await touchedSince(deps, head)
    if (typeof since === 'string') return since
    touched.push(...since)
  }
  return touched
}

/** The changed files the agent may not change. @param {string[]} touched @param {WriteScope} scope */
const outOfScope = (touched, scope) => touched.filter((path) => isRefused(scope, path))

/**
 * What the role may write: folders, the files right in component roots, never the engine's own
 * files: the configuration and the workflows of `.skraft/`.
 * @param {import('../../domain/pipeline/roles.mjs').Role} role
 * @param {{ slug: string, folder: string, config: import('../../domain/config/skraft-config.mjs').SkraftConfig }} run folder: where the runs' folders are
 * @returns {WriteScope}
 */
const writeScopeOf = (role, { slug, folder, config }) => ({
  allowed: allowedPaths(role, { slug, folder, components: config.components }),
  roots: rootFiles(role, config.components),
  engineFiles: [CONFIG_FILE],
})

/** The configuration, an ejected workflow, or a path outside the scope. @param {WriteScope} scope @param {string} path relative to the working copy */
const isRefused = (scope, path) => scope.engineFiles.includes(path) || path.startsWith(`${EJECTED}/`) || !isInside(scope, path)

/** @param {WriteScope} scope @param {string} path relative to the working copy */
const isInside = ({ allowed, roots }, path) => allowed.some((folder) => pathUnder(path, folder) !== null) || roots.some((root) => isRootFile(path, root))

/**
 * The files of a repository the attempt changed since the head, leaving out those already dirty
 * whose content it did not change again; a string when Git cannot tell.
 * @param {Pick<CheckDeps, 'sourceControl' | 'workspace' | 'hasher'>} deps @param {Head} head
 * @returns {Promise<string[] | string>}
 */
const touchedSince = async (deps, { repository, sha, dirty }) => {
  const changed = await deps.sourceControl.changedFiles(repository, sha)
  if (changed === null) return `Git cannot list what changed in ${repository} since ${sha}`
  const touched = []
  for (const path of changed.map((file) => joinRelative(repository, file))) {
    if (!(await keptAsBefore(deps, dirty, path))) touched.push(path)
  }
  return touched
}

/** @param {Pick<CheckDeps, 'workspace' | 'hasher'>} deps @param {Head['dirty']} dirty @param {string} path */
const keptAsBefore = async (deps, dirty, path) => {
  const before = dirty.find((entry) => entry.path === path)
  return before !== undefined && before.hash === (await contentHash(deps, path))
}

/** A file right in a folder, not in one of its subfolders. @param {string} path @param {string} root */
const isRootFile = (path, root) => {
  const inner = pathUnder(path, root)
  return inner !== null && !inner.includes('/')
}

/**
 * The commits of the pass judged against the convention, the story's issue, the TDD cycle and
 * the scenario the pass works on; the environment reason when the machine cannot list them.
 * @param {CheckDeps} deps
 * @param {Pick<CheckContext, 'config' | 'base' | 'story'>} run
 * @param {{ role: import('../../domain/pipeline/roles.mjs').Role, visitHeads: Head[], scenario: ScenarioPass | null, plan: import('../../domain/pipeline/scenarios.mjs').ScenarioPlan | null, carried?: Carried | null }} step
 * @returns {Promise<{ environment: string, checked: CheckedCommit[] } | { environment: null, checked: CheckedCommit[], found: Failure[], scenario: import('./scenario-checks.mjs').ScenarioRecord }>}
 */
const checkCommits = async (deps, run, step) => {
  const history = await commitsOf(deps, step.visitHeads, step.carried)
  if (typeof history === 'string') return { environment: history, checked: [] }
  const issue = issueOf(run.story)
  const { components } = run.config
  const judged = judgedPass(history, { issue, components }, step)
  const checked = judged.map(({ repository, sha, subject, kind, verdict }) => ({ repository, sha, subject, kind, verdict }))
  const found = [...commitFailures(judged, issue), ...scenarioFailures(judged, step.scenario, { plan: step.plan, components })]
  return { environment: null, checked, found, scenario: scenarioRecord(judged, step.scenario, { plan: step.plan, components }) }
}

/**
 * The pass's commits judged in their order, by the scenario it works on.
 * @param {import('../../domain/pipeline/commits.mjs').StepCommit[]} history
 * @param {{ issue: number | null, components: Component[] }} run @param {Parameters<typeof checkCommits>[2]} step
 */
const judgedPass = (history, { issue, components }, { scenario, plan }) => judgeCommits(history, { issue, scenario: scenarioJudging(scenario, plan, components), components })

/** @param {JudgedCommit[]} judged @param {number | null} issue @returns {Failure[]} */
const commitFailures = (judged, issue) => judged
  .filter((candidate) => candidate.verdict !== 'ok')
  .map((commit) => ({ code: breaksConvention(commit.verdict) ? 'commit-convention' : 'tdd', line: commitFailure(commit, { issue }) }))

/**
 * The commits of the pass in every repository, oldest first, and with `carried` the commits the
 * earlier visits' attempts made, in their place; a string when Git cannot tell. Greens are
 * ordered by repository, one repository after the other: a group's green is judged in its own.
 * @param {Pick<CheckDeps, 'sourceControl'>} deps
 * @param {Head[]} visitHeads @param {Carried | null | undefined} carried
 * @returns {Promise<import('../../domain/pipeline/commits.mjs').StepCommit[] | string>}
 */
const commitsOf = async (deps, visitHeads, carried) => {
  const own = await listedSince(deps, visitHeads)
  if (carried === null || carried === undefined || typeof own === 'string') return own
  const since = await listedSince(deps, carried.heads)
  if (typeof since === 'string') return since
  return since.filter(({ sha }) => carried.shas.includes(sha) || own.some((commit) => commit.sha === sha))
}

/**
 * The commits since the heads in every repository; a string when Git cannot tell.
 * @param {Pick<CheckDeps, 'sourceControl'>} deps @param {Head[]} heads
 * @returns {Promise<import('../../domain/pipeline/commits.mjs').StepCommit[] | string>}
 */
const listedSince = async ({ sourceControl }, heads) => {
  const commits = []
  for (const { repository, sha } of heads) {
    const listed = await sourceControl.commits(repository, sha)
    if (listed === null) return `Git cannot list the commits of ${repository} since ${sha}`
    commits.push(...listed.map((commit) => ({ repository, sha: commit.sha, parent: commit.parent, subject: commit.subject, body: commit.body, files: commit.files.map((file) => joinRelative(repository, file)) })))
  }
  return commits
}
