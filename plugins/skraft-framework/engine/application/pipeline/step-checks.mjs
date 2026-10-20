import { readOrName } from '../shared/workspace-reading.mjs'
import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { joinRelative, pathUnder } from '../../domain/config/relative-path.mjs'
import { parseCommand } from '../../domain/gates/command-line.mjs'
import { failureOf } from '../../domain/gates/gate-plan.mjs'
import { readResult } from '../../domain/pipeline/agent-result.mjs'
import { commitFailure, judgeCommits, redsToReplay } from '../../domain/pipeline/commits.mjs'
import { isFilled } from '../../domain/pipeline/outputs.mjs'
import { allowedPaths, rootFiles } from '../../domain/pipeline/roles.mjs'
import { adrFailures } from '../decisions/adr-checks.mjs'
import { baseOf } from '../config/bases.mjs'
import { checkDesignRecords } from './design-records.mjs'

/**
 * @typedef {import('../../domain/journal/run-state.mjs').Head} Head
 * @typedef {import('../../domain/pipeline/commits.mjs').JudgedCommit} JudgedCommit
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {'missing-outputs' | 'invalid-result' | 'design-records' | 'agent-blocked' | 'write-scope' | 'adr-lifecycle' | 'commit-convention' | 'tdd'} FailureCode
 * @typedef {{
 *   repository: string, sha: string, subject: string, kind: string, verdict: string,
 *   replay: { component: string, exitCode: number | null, durationMs: number } | null,
 * }} CheckedCommit
 * @typedef {{
 *   missing: string[], failures: string[], code: FailureCode | null, commits: CheckedCommit[],
 *   environment: null, replayMs: number,
 * } | { commits: CheckedCommit[], environment: string }} StepCheck
 *   environment: why the machine could not check the step (a missing test command, Git
 *   failing); the step then stays open.
 * @typedef {Map<string, { verdict: string, replay: CheckedCommit['replay'] }>} KnownCommits
 *   what earlier attempts of the pass found for each commit they checked, by sha.
 * @typedef {{
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   hasher: import('../ports/hasher.mjs').Hasher,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 *   commitReplay: import('../ports/commit-replay.mjs').CommitReplay,
 *   clock: import('../ports/clock.mjs').Clock,
 * }} CheckDeps
 * @typedef {{ code: FailureCode, line: string }} Failure
 * @typedef {{ allowed: string[], roots: string[], engineFiles: string[] }} WriteScope
 * @typedef {{ replays: Map<string, CheckedCommit['replay']>, details: Map<string, string>, replayMs: number }} ReplayTally
 *   what the replays of the pass found so far: the first replay of each red, why a red is not red, the time spent.
 */

/** Failure codes, the first one found naming the step's refusal. */
const PRIORITY = /** @type {const} */ (['missing-outputs', 'invalid-result', 'design-records', 'write-scope', 'adr-lifecycle', 'commit-convention', 'tdd'])

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
 * write scope, the DESIGN records of a role that keeps them, and its commits against the commit
 * convention and the TDD cycle, each red commit replayed.
 * @param {{ deps: CheckDeps, slug: string, config: import('../../domain/config/skraft-config.mjs').SkraftConfig, base: import('../config/bases.mjs').Base[] }} context
 * @param {{
 *   role: import('../../domain/pipeline/roles.mjs').Role, outputs: string[], precreated: Array<string | null>, result: string,
 *   visitHeads: Head[], redByGateFailure: boolean, known: KnownCommits,
 * }} step visitHeads: the heads when the pass started; redByGateFailure: the gates sent the work back, their failure standing for a red test
 * @returns {Promise<StepCheck>}
 */
export const checkStep = async (context, step) => {
  const read = await readAttempt(context, step)
  if ('stop' in read) return read.stop
  const commits = await checkCommits(context.deps, context, step)
  if (commits.environment !== null) return { ...environmentOnly(commits.environment), commits: commits.checked }
  const adr = await adrFailures(context.deps, { base: context.base, touched: read.touched })
  if (typeof adr === 'string') return { ...environmentOnly(adr), commits: commits.checked }
  const found = [...resultFailures(read.reading), ...recordFailures(read.records), ...scopeFailures(read.scope), ...adrLines(adr), ...commits.found]
  return refusal(read.missing, found, commits)
}

/**
 * What the attempt left before its commits: its outputs, its result, the files out of its scope
 * and its DESIGN records; the check that stops the step when one does.
 * @param {{ deps: CheckDeps, slug: string, config: import('../../domain/config/skraft-config.mjs').SkraftConfig, base: import('../config/bases.mjs').Base[] }} context
 * @param {Parameters<typeof checkStep>[1]} step
 * @returns {Promise<{ stop: StepCheck } | { missing: string[], reading: import('../../domain/pipeline/agent-result.mjs').ResultReading, touched: string[], scope: string[], records: string[] }>}
 */
const readAttempt = async ({ deps, slug, config, base }, step) => {
  const missing = await missingOutputs(deps, slug, step)
  const reading = readResult(await deps.files.read(slug, step.result))
  if (reading.ok && reading.result.status === 'blocked') return { stop: blockedBy(reading.result.summary) }
  const touched = await touchedPaths(deps, step.visitHeads)
  if (typeof touched === 'string') return { stop: environmentOnly(touched) }
  const records = step.role.records ? await checkDesignRecords(deps, { slug, base }) : { open: [], failures: [] }
  if (typeof records === 'string') return { stop: environmentOnly(records) }
  if (records.open.length > 0) return { stop: environmentOnly(records.open.join('; ')) }
  return { missing, reading, touched, scope: outOfScope(touched, writeScopeOf(step.role, { slug, config })), records: records.failures }
}

/** @param {string[]} lines @returns {Failure[]} */
const recordFailures = (lines) => lines.map((line) => ({ code: /** @type {const} */ ('design-records'), line }))

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
const blockedBy = (summary) => ({ missing: [], failures: [summary], code: 'agent-blocked', commits: [], environment: null, replayMs: 0 })

/** @param {import('../../domain/pipeline/agent-result.mjs').ResultReading} reading @returns {Failure[]} */
const resultFailures = (reading) => (reading.ok ? [] : [{ code: 'invalid-result', line: `result ${reading.errors.join('; ')}` }])

/** @param {string[]} paths @returns {Failure[]} */
const scopeFailures = (paths) => paths.map((path) => ({ code: /** @type {const} */ ('write-scope'), line: `out of write scope: ${path}` }))

/**
 * The step's refusal: every failure found, the code of the first one by priority.
 * @param {string[]} missing @param {Failure[]} found
 * @param {{ checked: CheckedCommit[], replayMs: number }} commits
 * @returns {StepCheck}
 */
const refusal = (missing, found, { checked, replayMs }) => ({
  missing, failures: found.map((failure) => failure.line), code: refusalCode(missing, found), commits: checked, environment: null, replayMs,
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
 * What the role may write: folders, the files right in component roots, never the engine's own files.
 * @param {import('../../domain/pipeline/roles.mjs').Role} role
 * @param {{ slug: string, config: import('../../domain/config/skraft-config.mjs').SkraftConfig }} run
 * @returns {WriteScope}
 */
const writeScopeOf = (role, { slug, config }) => ({
  allowed: allowedPaths(role, { slug, components: config.components }),
  roots: rootFiles(role, config.components),
  engineFiles: [CONFIG_FILE, config.workflow],
})

/** @param {WriteScope} scope @param {string} path relative to the working copy */
const isRefused = (scope, path) => scope.engineFiles.includes(path) || !isInside(scope, path)

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
 * The commits of the pass judged against the convention and the TDD cycle, each red commit
 * replayed; the environment reason when the machine cannot check them.
 * @param {CheckDeps} deps
 * @param {{ config: import('../../domain/config/skraft-config.mjs').SkraftConfig, base: import('../config/bases.mjs').Base[] }} run
 * @param {{ visitHeads: Head[], redByGateFailure: boolean, known: KnownCommits }} step
 * @returns {Promise<{ environment: string, checked: CheckedCommit[] } | { environment: null, checked: CheckedCommit[], found: Failure[], replayMs: number }>}
 */
const checkCommits = async (deps, { config, base }, { visitHeads, redByGateFailure, known }) => {
  const history = await commitsOf(deps, visitHeads)
  if (typeof history === 'string') return { environment: history, checked: [] }
  const judged = judgeCommits(history, { redByGateFailure })
  const replayed = await replayReds(deps, { config, base, judged, known })
  const checked = report(judged, replayed.replays)
  if (replayed.environment !== null) return { environment: replayed.environment, checked }
  return { environment: null, checked, found: commitFailures(judged, replayed.details), replayMs: replayed.replayMs }
}

/** @param {JudgedCommit[]} judged @param {Map<string, string>} details @returns {Failure[]} */
const commitFailures = (judged, details) => judged
  .filter((candidate) => candidate.verdict !== 'ok')
  .map((commit) => ({ code: commit.verdict === 'not-conventional' ? 'commit-convention' : 'tdd', line: commitFailure(commit, details.get(commit.sha)) }))

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
    commits.push(...listed.map((commit) => ({ repository, sha: commit.sha, subject: commit.subject, files: commit.files.map((file) => joinRelative(repository, file)) })))
  }
  return commits
}

/**
 * Replays the test command of each component a red commit of the pass touches, at that commit,
 * unless an earlier attempt of the pass already did. A red whose tests pass everywhere is
 * refused; a machine that cannot run them stops the check.
 * @param {CheckDeps} deps
 * @param {{ config: import('../../domain/config/skraft-config.mjs').SkraftConfig, base: import('../config/bases.mjs').Base[], judged: JudgedCommit[], known: KnownCommits }} request
 */
const replayReds = async (deps, { config, base, judged, known }) => {
  /** @type {ReplayTally} */
  const tally = { replays: new Map(), details: new Map(), replayMs: 0 }
  for (const red of redsToReplay(judged, config.tdd.replay)) {
    const environment = await settleRed(deps, { config, base, known, tally }, red)
    if (environment !== null) return { environment, ...tally }
  }
  return { environment: null, ...tally }
}

/**
 * Settles one red commit: from an earlier attempt, as touching no component, or by replaying it.
 * @param {CheckDeps} deps
 * @param {{ config: import('../../domain/config/skraft-config.mjs').SkraftConfig, base: import('../config/bases.mjs').Base[], known: KnownCommits, tally: ReplayTally }} run
 * @param {JudgedCommit} red
 * @returns {Promise<string | null>} why the machine could not replay it, null once settled
 */
const settleRed = async (deps, { config, base, known, tally }, red) => {
  const components = componentsOf(config.components, red.files)
  const earlier = known.get(red.sha)
  if (earlier) return reuseEarlier(tally, red, { earlier, components })
  if (components.length === 0) return withoutComponent(red)
  return replayRed(deps, { base, tally }, red, components)
}

/**
 * @param {ReplayTally} tally @param {JudgedCommit} red
 * @param {{ earlier: { verdict: string, replay: CheckedCommit['replay'] }, components: Component[] }} found
 * @returns {null} an earlier replay always settles the red
 */
const reuseEarlier = (tally, red, { earlier, components }) => {
  red.verdict = /** @type {import('../../domain/pipeline/commits.mjs').CommitVerdict} */ (earlier.verdict)
  tally.replays.set(red.sha, earlier.replay)
  tally.details.set(red.sha, notRed(components))
  return null
}

/** @param {JudgedCommit} red @returns {null} a red touching no component is settled without a replay */
const withoutComponent = (red) => {
  red.verdict = 'no-component'
  return null
}

/**
 * Replays the red for each component it touches; refuses it when every component's tests pass.
 * @param {CheckDeps} deps @param {{ base: import('../config/bases.mjs').Base[], tally: ReplayTally }} run
 * @param {JudgedCommit} red @param {Component[]} components
 * @returns {Promise<string | null>} why the machine could not replay it
 */
const replayRed = async (deps, run, red, components) => {
  let failing = false
  for (const component of components) {
    const replay = await replayComponent(deps, run, red, component)
    if (replay.environment !== null) return replay.environment
    failing ||= replay.failure === 'deterministic'
  }
  if (!failing) markNotRed(run.tally, red, components)
  return null
}

/** @param {ReplayTally} tally @param {JudgedCommit} red @param {Component[]} components */
const markNotRed = (tally, red, components) => {
  red.verdict = 'not-red'
  tally.details.set(red.sha, notRed(components))
}

/**
 * Runs a component's test command at the red commit.
 * @param {CheckDeps} deps @param {{ base: import('../config/bases.mjs').Base[], tally: ReplayTally }} run
 * @param {JudgedCommit} red @param {Component} component
 * @returns {Promise<{ environment: string } | { environment: null, failure: ReturnType<typeof failureOf> }>}
 */
const replayComponent = async (deps, { base, tally }, red, component) => {
  const command = testCommandOf(base, component)
  if (command.environment !== null) return command
  const answer = await timedReplay(deps, tally, { red, component, argv: command.argv })
  const failure = failureOf(answer)
  if (failure !== 'environment') return { environment: null, failure }
  return { environment: `replaying ${red.sha.slice(0, 7)} for ${component.name}: ${answer.error ?? `${command.line} exited ${answer.exitCode}`}` }
}

/**
 * The argv that runs a component's tests; the environment reason when it has none that parses.
 * @param {import('../config/bases.mjs').Base[]} base @param {Component} component
 * @returns {{ environment: string } | { environment: null, line: string, argv: string[] }}
 */
const testCommandOf = (base, component) => {
  const line = component.commands.test
  if (line === undefined) return { environment: `component ${component.name} has no test command; add commands.test to it in ${CONFIG_FILE} so test commits can be replayed` }
  const parsed = parseCommand(line, { baseSha: baseOf(base, component.name)?.sha ?? null })
  if (!parsed.ok) return { environment: `${component.name} command ${JSON.stringify(line)} ${parsed.reason}` }
  return { environment: null, line, argv: parsed.argv }
}

/**
 * Replays the red in the component's folder, timing it; the first replay of a commit is the one reported.
 * @param {Pick<CheckDeps, 'clock' | 'commitReplay'>} deps @param {ReplayTally} tally
 * @param {{ red: JudgedCommit, component: Component, argv: string[] }} replay
 */
const timedReplay = async (deps, tally, { red, component, argv }) => {
  const started = deps.clock.now()
  const answer = await deps.commitReplay.run({ repository: red.repository, sha: red.sha, cwd: /** @type {string} */ (pathUnder(component.root, red.repository)), argv })
  const durationMs = deps.clock.now().getTime() - started.getTime()
  tally.replayMs += durationMs
  if (!tally.replays.has(red.sha)) tally.replays.set(red.sha, { component: component.name, exitCode: answer.exitCode, durationMs })
  return answer
}

/** @param {Component[]} components */
const notRed = (components) => `the tests of ${components.map(({ name }) => name).join(', ')} pass at it`

/**
 * The components a commit's files belong to, each file to the deepest component root holding
 * it; files of the tracking folder belong to none.
 * @param {Component[]} components @param {string[]} files relative to the working copy
 */
const componentsOf = (components, files) => {
  /** @type {Set<Component>} */
  const touched = new Set()
  for (const file of files.filter((path) => pathUnder(path, '.copilot-tracking') === null)) {
    const owner = components
      .filter((component) => pathUnder(file, component.root) !== null)
      .sort((a, b) => b.root.length - a.root.length)[0]
    if (owner) touched.add(owner)
  }
  return [...touched]
}

/** @param {JudgedCommit[]} judged @param {Map<string, CheckedCommit['replay']>} replays @returns {CheckedCommit[]} */
const report = (judged, replays) => judged
  .map(({ repository, sha, subject, kind, verdict }) => ({ repository, sha, subject, kind, verdict, replay: replays.get(sha) ?? null }))

