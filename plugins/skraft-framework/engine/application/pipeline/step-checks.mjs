import { readOrName } from '../shared/workspace-reading.mjs'
import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { joinRelative, pathUnder } from '../../domain/config/relative-path.mjs'
import { readResult } from '../../domain/pipeline/agent-result.mjs'
import { breaksConvention, commitFailure, issueOf, judgeCommits } from '../../domain/pipeline/commits.mjs'
import { TRACKING } from '../../domain/pipeline/component-files.mjs'
import { isFilled } from '../../domain/pipeline/outputs.mjs'
import { proseProblems, readProse } from '../../domain/reporting/pull-request-prose.mjs'
import { allowedPaths, makesCommits, rootFiles, trackingFolder } from '../../domain/pipeline/roles.mjs'
import { adrFailures } from '../decisions/adr-checks.mjs'
import { emptyTally, replayReds, report } from './commit-replays.mjs'
import { checkDesignRecords } from './design-records.mjs'
import { checkGherkinRecords } from './gherkin-records.mjs'
import { checkResearchRecords } from './research-records.mjs'
import { EJECTED } from '../workflow/called-workflows.mjs'
import { planOf, replayScenarioGreen, scenarioFailures, scenarioJudging, scenarioRecord } from './scenario-checks.mjs'

/**
 * @typedef {import('../../domain/journal/run-state.mjs').Head} Head
 * @typedef {import('../../domain/pipeline/commits.mjs').JudgedCommit} JudgedCommit
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('../../domain/config/skraft-config.mjs').SkraftConfig} SkraftConfig
 * @typedef {'missing-outputs' | 'invalid-result' | 'design-records' | 'research-records' | 'gherkin-records' | 'scenarios' | 'pull-request-prose' | 'agent-blocked' | 'write-scope' | 'uncommitted' | 'adr-lifecycle' | 'commit-convention' | 'tdd'} FailureCode
 * @typedef {{
 *   repository: string, sha: string, subject: string, kind: string, verdict: string,
 *   replay: import('./commit-replays.mjs').Replay | null,
 * }} CheckedCommit
 * @typedef {{
 *   missing: string[], failures: string[], code: FailureCode | null, commits: CheckedCommit[],
 *   environment: null, replayMs: number, judgeCost?: number, uncommitted?: UncommittedFile[], scenario?: import('./scenario-checks.mjs').ScenarioRecord,
 * } | { commits: CheckedCommit[], environment: string, incident?: import('../../domain/pipeline/incidents.mjs').Incident }} StepCheck
 *   environment: why the machine could not check the step (a missing test command, Git
 *   failing); the step then stays open. incident: whose it is to fix and where the command that
 *   stopped printed, when a replay stopped; else the machine's, with no log. judgeCost: what the
 *   replay judge cost, when the host tells. uncommitted: the files in its scope the agent changed
 *   and left uncommitted, which the engine commits once the step is done: only an agent with no
 *   shell gets there, one with a shell is refused for them; absent when the agent is blocked.
 * @typedef {{ repository: string, file: string, path: string }} UncommittedFile
 *   file: relative to its repository; path: relative to the working copy.
 * @typedef {import('./commit-replays.mjs').KnownCommits} KnownCommits
 *   what earlier attempts of the pass found for each commit they checked, by sha.
 * @typedef {{
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   hasher: import('../ports/hasher.mjs').Hasher,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 *   commitReplay: import('../ports/commit-replay.mjs').CommitReplay,
 *   clock: import('../ports/clock.mjs').Clock,
 *   agentRunner: import('../ports/agent-runner.mjs').AgentRunner,
 *   progress: import('../ports/pipeline-progress.mjs').PipelineProgress,
 * }} CheckDeps
 * @typedef {{ code: FailureCode, line: string }} Failure
 * @typedef {{ allowed: string[], roots: string[], engineFiles: string[] }} WriteScope
 * @typedef {{
 *   deps: CheckDeps, slug: string, config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 *   base: import('../config/bases.mjs').Base[], story: { issue?: number | null } | null,
 *   judge: import('./replay-judge.mjs').JudgeRun,
 * }} CheckContext
 *   judge: what the replay judge runs on, and the attempt whose commits it judges
 * @typedef {import('./scenario-checks.mjs').ScenarioPass} ScenarioPass
 */

/** Failure codes, the first one found naming the step's refusal. */
const PRIORITY = /** @type {const} */ (['missing-outputs', 'invalid-result', 'design-records', 'research-records', 'gherkin-records', 'scenarios', 'pull-request-prose', 'write-scope', 'uncommitted', 'adr-lifecycle', 'commit-convention', 'tdd'])

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

/** @param {Pick<CheckDeps, 'workspace' | 'hasher'>} deps @param {string} path relative to the working copy */
const contentHash = async ({ workspace, hasher }, path) => {
  const text = await readOrName(workspace, path)
  return text === null ? null : hasher.sha256(text)
}

/**
 * What an agent's attempt left: its outputs, its result, the files it changed against its
 * write scope, the records its role keeps, and its commits against the commit
 * convention, the story's issue and the TDD cycle, each red commit replayed.
 * @param {CheckContext} context
 * @param {{
 *   role: import('../../domain/pipeline/roles.mjs').Role, outputs: string[], precreated: Array<string | null>, result: string,
 *   visitHeads: Head[], redByGateFailure: boolean, known: KnownCommits, scenario: ScenarioPass | null,
 * }} step visitHeads: the heads when the pass started; redByGateFailure: the gates sent the work back, their failure standing for a red test;
 *   scenario: the scenario the pass works on, null for none
 * @returns {Promise<StepCheck>}
 */
export const checkStep = async (context, step) => {
  const read = await readAttempt(context, step)
  if ('stop' in read) return read.stop
  const commits = await judgedCommits(context, { ...step, plan: read.plan.plan })
  if (commits.environment !== null) return { ...environmentOnly(commits.environment), commits: commits.checked, ...incidentOf(commits) }
  const adr = await adrFailures(context.deps, { base: context.base, touched: read.touched })
  if (typeof adr === 'string') return { ...environmentOnly(adr), commits: commits.checked }
  const found = [...resultFailures(read.reading), ...read.records, ...read.plan.failures, ...read.prose, ...read.scope.failures, ...adrLines(adr), ...commits.found]
  return { ...refusal(read.missing, found, commits), uncommitted: read.scope.uncommitted, scenario: commits.scenario }
}

/**
 * The attempt's commits checked, the working copy as the replay judge found it: a judge has a
 * shell to read with, and one that changed HEAD or a file stops the step for a human.
 * @param {CheckContext} context @param {Parameters<typeof checkCommits>[2]} step
 */
const judgedCommits = async (context, step) => {
  const before = await workingCopyOf(context)
  const commits = await checkCommits(context.deps, context, step)
  if (await workingCopyOf(context) === before) return commits
  return { environment: JUDGE_MOVED, checked: commits.checked, incident: /** @type {const} */ ({ owner: 'judge', log: null }) }
}

/**
 * Each repository's HEAD and changed files, the tracking folder left out: the engine writes there
 * while it checks (replay logs, the judge's answers, the journal).
 * @param {CheckContext} context
 */
const workingCopyOf = async ({ deps, base }) => JSON.stringify((await headsOf(deps, base))
  .map(({ repository, sha, dirty }) => ({ repository, sha, dirty: dirty.filter(({ path }) => pathUnder(path, TRACKING) === null) })))

/** Why a step stops when the working copy changed while its commits were checked. */
const JUDGE_MOVED = 'the replay judge changed the working copy (a commit or a file) while it judged; undo that change, then retry'

/**
 * What the attempt left before its commits: its outputs, its result, the files out of its scope
 * or left uncommitted, and the records its role keeps; the check that stops the step when one does.
 * @param {CheckContext} context
 * @param {Parameters<typeof checkStep>[1]} step
 * @returns {Promise<{ stop: StepCheck } | { missing: string[], reading: import('../../domain/pipeline/agent-result.mjs').ResultReading, touched: string[], scope: { failures: Failure[], uncommitted: UncommittedFile[] }, records: Failure[], prose: Failure[], plan: Awaited<ReturnType<typeof planOf>> }>}
 */
const readAttempt = async ({ deps, slug, config, base }, step) => {
  const missing = await missingOutputs(deps, slug, step)
  const reading = readResult(await deps.files.read(slug, step.result))
  if (reading.ok && reading.result.status === 'blocked') return { stop: blockedBy(reading.result.summary) }
  const touched = await touchedPaths(deps, step.visitHeads)
  if (typeof touched === 'string') return { stop: environmentOnly(touched) }
  const scope = await scopeFailures(deps, step, { slug, config, touched })
  if (typeof scope === 'string') return { stop: environmentOnly(scope) }
  const records = await keptRecords(deps, step, { slug, base, config })
  if (typeof records === 'string') return { stop: environmentOnly(records) }
  return { missing, reading, touched, scope, records, prose: await proseFailures(deps, slug, step, missing), plan: await planOf(deps, { slug, components: config.components }, step, missing) }
}

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
const keptRecords = async (deps, { role }, { slug, base, config }) => {
  if (role.records) return coded('design-records', await checkDesignRecords(deps, { slug, base }))
  if (role.citations) return coded('research-records', await checkResearchRecords(deps, { slug, roots: config.components.map(({ root }) => root) }))
  if (role.scenarios && writesGherkin(config)) return coded('gherkin-records', await checkGherkinRecords(deps, { slug, components: config.components }))
  return []
}

/** Whether any component of the run describes its behaviour in Gherkin. @param {SkraftConfig} config */
const writesGherkin = ({ components }) => components.some(({ bdd }) => bdd === true)

/** @param {FailureCode} code @param {string[] | string} lines @returns {Failure[] | string} */
const coded = (code, lines) => (typeof lines === 'string' ? lines : lines.map((line) => ({ code, line })))

/** @param {string[]} lines @returns {Failure[]} */
const adrLines = (lines) => lines.map((line) => ({ code: /** @type {const} */ ('adr-lifecycle'), line }))

/** @param {string} reason @returns {StepCheck} */
const environmentOnly = (reason) => ({ commits: [], environment: reason })

/** The incident a replay that stopped the check left; none when Git stopped it first. @param {{ incident?: import('../../domain/pipeline/incidents.mjs').Incident | null }} commits */
const incidentOf = ({ incident }) => (incident ? { incident } : {})

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
const blockedBy = (summary) => ({ missing: [], failures: [summary], code: 'agent-blocked', commits: [], environment: null, replayMs: 0 })

/** @param {import('../../domain/pipeline/agent-result.mjs').ResultReading} reading @returns {Failure[]} */
const resultFailures = (reading) => (reading.ok ? [] : [{ code: 'invalid-result', line: `result ${reading.errors.join('; ')}` }])

/**
 * The files the attempt changed out of its write scope, then those in its scope it left
 * uncommitted outside the tracking folder: an agent with a shell commits its changes, refused
 * otherwise; the engine commits those of an agent with none, once its step is done.
 * @param {Pick<CheckDeps, 'sourceControl'>} deps
 * @param {{ role: import('../../domain/pipeline/roles.mjs').Role, visitHeads: Head[] }} step
 * @param {{ slug: string, config: import('../../domain/config/skraft-config.mjs').SkraftConfig, touched: string[] }} attempt
 * @returns {Promise<{ failures: Failure[], uncommitted: UncommittedFile[] } | string>} a string: why Git cannot tell
 */
const scopeFailures = async (deps, { role, visitHeads }, { slug, config, touched }) => {
  const left = await uncommittedPaths(deps, visitHeads)
  if (typeof left === 'string') return left
  const refused = outOfScope(touched, writeScopeOf(role, { slug, config }))
  const kept = left.filter(({ path }) => touched.includes(path) && !refused.includes(path) && pathUnder(path, trackingFolder(slug)) === null)
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
 * @param {{ checked: CheckedCommit[], replayMs: number, judgeCost?: number }} commits
 * @returns {StepCheck}
 */
const refusal = (missing, found, { checked, replayMs, judgeCost }) => ({
  missing, failures: found.map((failure) => failure.line), code: refusalCode(missing, found), commits: checked, environment: null, replayMs, judgeCost,
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
 * @param {{ slug: string, config: import('../../domain/config/skraft-config.mjs').SkraftConfig }} run
 * @returns {WriteScope}
 */
const writeScopeOf = (role, { slug, config }) => ({
  allowed: allowedPaths(role, { slug, components: config.components }),
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
 * the scenario the pass works on; each red of an acceptance test replayed, and the green of a
 * scenario; the environment reason when the machine cannot check them.
 * @param {CheckDeps} deps
 * @param {Pick<CheckContext, 'config' | 'base' | 'story' | 'slug' | 'judge'>} run
 * @param {{ role: import('../../domain/pipeline/roles.mjs').Role, visitHeads: Head[], redByGateFailure: boolean, known: KnownCommits, scenario: ScenarioPass | null, plan: import('../../domain/pipeline/scenarios.mjs').ScenarioPlan | null }} step
 * @returns {Promise<{ environment: string, checked: CheckedCommit[] } | { environment: null, checked: CheckedCommit[], found: Failure[], replayMs: number, judgeCost: number | undefined, scenario: import('./scenario-checks.mjs').ScenarioRecord }>}
 */
const checkCommits = async (deps, run, step) => {
  const history = await commitsOf(deps, step.visitHeads)
  if (typeof history === 'string') return { environment: history, checked: [] }
  const issue = issueOf(run.story)
  const judged = judgedPass(history, { issue, components: run.config.components }, step)
  const tally = emptyTally()
  const environment = await replayed(deps, { run, step, judged, tally })
  const checked = report(judged, tally.replays)
  return environment === null ? { environment, checked, ...passFound(judged, { issue, tally, components: run.config.components }, step) } : { environment, checked, incident: tally.incident }
}

/**
 * What the commits of a pass leave once judged and replayed: the failures, the replay time, what
 * the pass records for the scenarios after it.
 * @param {JudgedCommit[]} judged
 * @param {{ issue: number | null, tally: import('./commit-replays.mjs').ReplayTally, components: Component[] }} run
 * @param {Parameters<typeof checkCommits>[2]} step
 */
const passFound = (judged, { issue, tally, components }, { scenario, plan }) => ({
  found: [...commitFailures(judged, { details: tally.details, issue }), ...scenarioFailures(judged, scenario, { plan, components })],
  replayMs: tally.replayMs,
  judgeCost: tally.judgeCost,
  scenario: scenarioRecord(judged, scenario, { plan, commands: tally.commands, components }),
})

/**
 * The pass's commits judged in their order, by the scenario it works on.
 * @param {import('../../domain/pipeline/commits.mjs').StepCommit[]} history
 * @param {{ issue: number | null, components: Component[] }} run @param {Parameters<typeof checkCommits>[2]} step
 */
const judgedPass = (history, { issue, components }, { redByGateFailure, scenario, plan }) => judgeCommits(history, { redByGateFailure, issue, scenario: scenarioJudging(scenario, plan, components), components })

/**
 * Replays the reds of an acceptance test, never a red of an inner loop nor a test that kills a
 * surviving mutant, then the green of a scenario.
 * @param {CheckDeps} deps
 * @param {{ run: Pick<CheckContext, 'config' | 'base' | 'slug' | 'judge'>, step: Parameters<typeof checkCommits>[2], judged: JudgedCommit[], tally: import('./commit-replays.mjs').ReplayTally }} pass
 * @returns {Promise<string | null>}
 */
const replayed = async (deps, { run, step, judged, tally }) => {
  const replaying = { base: run.base, tally, slug: run.slug, judge: run.judge, scenario: judgedScenario(step), retried: false }
  // Stryker disable next-line ArrayDeclaration: a list that holds no red commit replays none
  const reds = await replayReds(deps, replaying, { config: run.config, judged: step.role.tdd === 'red' ? judged : [], known: step.known })
  return reds ?? replayScenarioGreen(deps, replaying, { judged, scenario: step.scenario, components: run.config.components })
}

/**
 * The scenario the judge is told the pass works on: the plan's first on the pass that writes it.
 * @param {Parameters<typeof checkCommits>[2]} step @returns {{ index: number, title: string } | null}
 */
const judgedScenario = ({ scenario, plan }) => {
  const told = scenario?.scenario ?? plan?.scenarios[0] ?? null
  return told === null ? null : { index: told.index, title: told.title }
}

/** @param {JudgedCommit[]} judged @param {{ details: Map<string, string>, issue: number | null }} context @returns {Failure[]} */
const commitFailures = (judged, { details, issue }) => judged
  .filter((candidate) => candidate.verdict !== 'ok')
  .map((commit) => ({ code: breaksConvention(commit.verdict) ? 'commit-convention' : 'tdd', line: commitFailure(commit, { detail: details.get(commit.sha), issue }) }))

/**
 * The commits of the pass in every repository, oldest first; a string when Git cannot tell.
 * @param {Pick<CheckDeps, 'sourceControl'>} deps
 * @param {Head[]} visitHeads
 * @returns {Promise<import('../../domain/pipeline/commits.mjs').StepCommit[] | string>}
 */
const commitsOf = async ({ sourceControl }, visitHeads) => {
  const commits = []
  for (const { repository, sha } of visitHeads) {
    const listed = await sourceControl.commits(repository, sha)
    if (listed === null) return `Git cannot list the commits of ${repository} since ${sha}`
    commits.push(...listed.map((commit) => ({ repository, sha: commit.sha, parent: commit.parent, subject: commit.subject, body: commit.body, files: commit.files.map((file) => joinRelative(repository, file)) })))
  }
  return commits
}
