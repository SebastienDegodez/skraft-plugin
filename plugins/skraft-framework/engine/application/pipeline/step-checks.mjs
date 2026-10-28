import { readOrName } from '../shared/workspace-reading.mjs'
import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { joinRelative, pathUnder } from '../../domain/config/relative-path.mjs'
import { installerIn, parseCommand, programChoices } from '../../domain/gates/command-line.mjs'
import { failureOf } from '../../domain/gates/gate-plan.mjs'
import { readResult } from '../../domain/pipeline/agent-result.mjs'
import { breaksConvention, commitFailure, issueOf, judgeCommits, redsToReplay } from '../../domain/pipeline/commits.mjs'
import { isFilled } from '../../domain/pipeline/outputs.mjs'
import { proseProblems, readProse } from '../../domain/reporting/pull-request-prose.mjs'
import { allowedPaths, rootFiles } from '../../domain/pipeline/roles.mjs'
import { adrFailures } from '../decisions/adr-checks.mjs'
import { baseOf } from '../config/bases.mjs'
import { checkDesignRecords } from './design-records.mjs'
import { EJECTED } from '../workflow/called-workflows.mjs'

/**
 * @typedef {import('../../domain/journal/run-state.mjs').Head} Head
 * @typedef {import('../../domain/pipeline/commits.mjs').JudgedCommit} JudgedCommit
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {'missing-outputs' | 'invalid-result' | 'design-records' | 'pull-request-prose' | 'agent-blocked' | 'write-scope' | 'adr-lifecycle' | 'commit-convention' | 'tdd'} FailureCode
 * @typedef {{
 *   repository: string, sha: string, subject: string, kind: string, verdict: string,
 *   replay: { component: string, command: ReplayedCommand, exitCode: number | null, durationMs: number } | null,
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
 * @typedef {{
 *   deps: CheckDeps, slug: string, config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 *   base: import('../config/bases.mjs').Base[], story: { issue?: number | null } | null,
 * }} CheckContext
 * @typedef {{ replays: Map<string, CheckedCommit['replay']>, details: Map<string, string>, replayMs: number }} ReplayTally
 *   what the replays of the pass found so far: the replay each red reports (its first that did not pass, else its last), why a red is not red, the time spent.
 */

/** Failure codes, the first one found naming the step's refusal. */
const PRIORITY = /** @type {const} */ (['missing-outputs', 'invalid-result', 'design-records', 'pull-request-prose', 'write-scope', 'adr-lifecycle', 'commit-convention', 'tdd'])

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
 * convention, the story's issue and the TDD cycle, each red commit replayed.
 * @param {CheckContext} context
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
  const found = [...resultFailures(read.reading), ...recordFailures(read.records), ...read.prose, ...scopeFailures(read.scope), ...adrLines(adr), ...commits.found]
  return refusal(read.missing, found, commits)
}

/**
 * What the attempt left before its commits: its outputs, its result, the files out of its scope
 * and its DESIGN records; the check that stops the step when one does.
 * @param {CheckContext} context
 * @param {Parameters<typeof checkStep>[1]} step
 * @returns {Promise<{ stop: StepCheck } | { missing: string[], reading: import('../../domain/pipeline/agent-result.mjs').ResultReading, touched: string[], scope: string[], records: string[], prose: Failure[] }>}
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
  return { missing, reading, touched, scope: outOfScope(touched, writeScopeOf(step.role, { slug, config })), records: records.failures, prose: await proseFailures(deps, slug, step, missing) }
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
 * The commits of the pass judged against the convention, the story's issue and the TDD cycle,
 * each red commit replayed, except the tests that kill surviving mutants, which pass on the code
 * they test; the environment reason when the machine cannot check them.
 * @param {CheckDeps} deps
 * @param {Pick<CheckContext, 'config' | 'base' | 'story'>} run
 * @param {{ role: import('../../domain/pipeline/roles.mjs').Role, visitHeads: Head[], redByGateFailure: boolean, known: KnownCommits }} step
 * @returns {Promise<{ environment: string, checked: CheckedCommit[] } | { environment: null, checked: CheckedCommit[], found: Failure[], replayMs: number }>}
 */
const checkCommits = async (deps, { config, base, story }, { role, visitHeads, redByGateFailure, known }) => {
  const history = await commitsOf(deps, visitHeads)
  if (typeof history === 'string') return { environment: history, checked: [] }
  const issue = issueOf(story)
  const judged = judgeCommits(history, { redByGateFailure, issue })
  const replayed = await replayReds(deps, { config, base, judged: role.tdd === 'kill' ? [] : judged, known })
  const checked = report(judged, replayed.replays)
  if (replayed.environment !== null) return { environment: replayed.environment, checked }
  return { environment: null, checked, found: commitFailures(judged, { details: replayed.details, issue }), replayMs: replayed.replayMs }
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
  tally.details.set(red.sha, notRed(components, earlier.replay))
  return null
}

/** @param {JudgedCommit} red @returns {null} a red touching no component is settled without a replay */
const withoutComponent = (red) => {
  red.verdict = 'no-component'
  return null
}

/**
 * Replays the red: the test command of each component it touches, then, when they all pass, the
 * e2e command of those that have one; refuses it when every one passes.
 * @param {CheckDeps} deps @param {ReplayRun} run
 * @param {JudgedCommit} red @param {Component[]} components
 * @returns {Promise<string | null>} why the machine could not replay it
 */
const replayRed = async (deps, run, red, components) => {
  const tested = await replayEach(deps, run, red, components.map((component) => ({ component, command: testCommandOf(run.base, component) })))
  if (tested.environment !== null || tested.failing) return tested.environment
  const played = await replayEach(deps, run, red, components.filter(hasE2e).map((component) => ({ component, command: parsedCommand(run.base, component, 'e2e') })))
  if (played.environment === null && !played.failing) markNotRed(run.tally, red, components)
  return played.environment
}

/**
 * Runs each command at the red commit; the first the machine cannot run stops the others.
 * @param {CheckDeps} deps @param {ReplayRun} run @param {JudgedCommit} red
 * @param {Array<{ component: Component, command: ReplayCommand }>} commands
 * @returns {Promise<{ environment: string } | { environment: null, failing: boolean }>}
 */
const replayEach = async (deps, run, red, commands) => {
  let failing = false
  for (const { component, command } of commands) {
    const replay = await replayCommand(deps, run.tally, { red, component, command })
    if (replay.environment !== null) return replay
    failing ||= replay.failure === 'deterministic'
  }
  return { environment: null, failing }
}

/** @param {Component} component */
const hasE2e = (component) => component.commands.e2e !== undefined

/** @param {ReplayTally} tally @param {JudgedCommit} red @param {Component[]} components */
const markNotRed = (tally, red, components) => {
  red.verdict = 'not-red'
  tally.details.set(red.sha, notRed(components, tally.replays.get(red.sha)))
}

/**
 * @typedef {{ base: import('../config/bases.mjs').Base[], tally: ReplayTally }} ReplayRun
 * @typedef {{ environment: string } | { environment: null, failure: ReturnType<typeof failureOf> }} ComponentReplay
 * @typedef {{ environment: string } | { environment: null, name: ReplayedCommand, line: string, argv: string[] }} ReplayCommand
 * @typedef {'test' | 'e2e'} ReplayedCommand
 */

/**
 * Runs one command of a component at the red commit; a command that cannot start or ends for
 * the machine's reasons is no failure of the tests, and neither is an e2e failure its parent shows.
 * @param {CheckDeps} deps @param {ReplayTally} tally
 * @param {{ red: JudgedCommit, component: Component, command: ReplayCommand }} replay
 * @returns {Promise<ComponentReplay>}
 */
const replayCommand = async (deps, tally, { red, component, command }) => {
  if (command.environment !== null) return command
  const answer = await timedReplay(deps, tally, { red, component, command })
  const failure = failureOf(answer)
  if (failure === 'environment') return { environment: `replaying ${red.sha.slice(0, 7)} for ${component.name}: ${answer.error ?? `${command.line} exited ${answer.exitCode}`}` }
  if (failure === null || command.name === 'test') return { environment: null, failure }
  return failureAtParent(deps, tally, { red, component, command })
}

/** An e2e failure that proves the red. @type {ComponentReplay} */
const RED = Object.freeze({ environment: null, failure: 'deterministic' })
/** An e2e failure its parent shows too, for a reason the agent can act on: it proves nothing. @type {ComponentReplay} */
const UNPROVEN = Object.freeze({ environment: null, failure: null })
/** What Playwright prints when it finds no test to run, and exits 1. */
const NO_TESTS = /No tests found/

/**
 * An e2e failure proves the red only when the e2e tests pass at the commit's parent: a machine
 * that cannot run them (no browser, a busy port, missing dependencies) fails them there too. A
 * parent that is a red commit of the pass is not replayed again: its e2e replay tells.
 * @param {CheckDeps} deps @param {ReplayTally} tally
 * @param {{ red: JudgedCommit, component: Component, command: { line: string, argv: string[] } }} replay
 * @returns {Promise<ComponentReplay>}
 */
const failureAtParent = async (deps, tally, replay) => {
  const known = tally.replays.get(replay.red.parent)
  if (known?.command === 'e2e' && known.component === replay.component.name) return known.exitCode === 0 ? RED : UNPROVEN
  const { red, component, command } = replay
  return atParent(replay, await timedRun(deps, tally, { repository: red.repository, sha: red.parent, component, argv: command.argv }))
}

/**
 * What the e2e replay at the parent tells: the red proven, an e2e test committed with no other
 * test to fail beside it, or a machine that cannot run the e2e tests.
 * @param {{ red: JudgedCommit, component: Component, command: { line: string } }} replay
 * @param {import('../ports/command-runner.mjs').CommandResult} answer
 * @returns {ComponentReplay}
 */
const atParent = ({ red, component, command }, answer) => {
  const failure = failureOf(answer)
  if (failure === null) return RED
  const at = `replaying ${red.sha.slice(0, 7)} for ${component.name}: ${command.line}`
  if (failure === 'environment') return { environment: `${at} could not run at its parent, so its failure proves nothing; fix the machine, then retry` }
  if (NO_TESTS.test(`${answer.stdout}\n${answer.stderr}`)) return UNPROVEN
  return { environment: `${at} fails at its parent too, so its failure proves nothing; make ${command.line} pass at that parent on this machine, then retry` }
}

/**
 * The argv that runs a component's tests; the environment reason when it has none that parses.
 * @param {import('../config/bases.mjs').Base[]} base @param {Component} component
 * @returns {ReplayCommand}
 */
const testCommandOf = (base, component) => {
  const line = component.commands.test
  if (line === undefined) return { environment: `component ${component.name} has no test command; add commands.test to it in ${CONFIG_FILE} so test commits can be replayed` }
  return parsedCommand(base, component, 'test')
}

/**
 * The argv of a component's command the component declares; the environment reason when it does not parse.
 * @param {import('../config/bases.mjs').Base[]} base @param {Component} component @param {ReplayedCommand} name
 * @returns {ReplayCommand}
 */
const parsedCommand = (base, component, name) => {
  const line = /** @type {string} */ (component.commands[name])
  const parsed = parseCommand(line, { baseSha: baseOf(base, component.name)?.sha ?? null })
  if (!parsed.ok) return { environment: `${component.name} command ${JSON.stringify(line)} ${parsed.reason}` }
  const installer = installerIn(parsed.argv)
  if (installer !== null) return { environment: `${component.name} command ${JSON.stringify(line)} runs ${installer}: replayed at a commit, it would change through the replay's links the dependencies the working copy installed; take the install out of it` }
  return { environment: null, name, line, argv: parsed.argv }
}

/**
 * Replays the red in the component's folder, timed and reported.
 * @param {Pick<CheckDeps, 'clock' | 'commitReplay'>} deps @param {ReplayTally} tally
 * @param {{ red: JudgedCommit, component: Component, command: { name: ReplayedCommand, argv: string[] } }} replay
 */
const timedReplay = async (deps, tally, { red, component, command }) => {
  const answer = await timedRun(deps, tally, { repository: red.repository, sha: red.sha, component, argv: command.argv })
  reportReplay(tally, red.sha, { component: component.name, command: command.name, exitCode: answer.exitCode, durationMs: answer.durationMs })
  return answer
}

/**
 * Runs a program on a commit's files from a component's folder, the first of its choices that
 * starts, as the gates run it (`python`: the component's virtual environment first); its time
 * counts as replaying.
 * @param {Pick<CheckDeps, 'clock' | 'commitReplay'>} deps @param {ReplayTally} tally
 * @param {{ repository: string, sha: string, component: Component, argv: string[] }} run
 */
const timedRun = async (deps, tally, { repository, sha, component, argv }) => {
  const started = deps.clock.now()
  const cwd = /** @type {string} */ (pathUnder(component.root, repository))
  const answer = await deps.commitReplay.run({ repository, sha, cwd, choices: programChoices(argv), importRoots: importRootsOf(component) })
  const durationMs = deps.clock.now().getTime() - started.getTime()
  tally.replayMs += durationMs
  return { ...answer, durationMs }
}

/**
 * A Python component's source folders, which come first on the replayed program's import path:
 * an editable install in the virtual environment the replay links would import the working
 * copy's code instead of the commit's. None for another stack.
 * @param {Component} component @returns {string[]}
 */
const importRootsOf = (component) => (component.stack === 'python' ? component.paths.src : [])

/**
 * The replay a commit reports: its first that did not pass, else its last.
 * @param {ReplayTally} tally @param {string} sha @param {NonNullable<CheckedCommit['replay']>} replay
 */
const reportReplay = (tally, sha, replay) => {
  const reported = tally.replays.get(sha)
  if (!reported || reported.exitCode === 0) tally.replays.set(sha, replay)
}

/** Why its failing e2e tests do not make a commit red. */
const E2E_ALONE = 'its failing e2e tests prove nothing alone: they fail at its parent too, a test commit of this pass or one with no e2e test yet; commit them all in one commit, or with a failing unit test, or with the code that makes them pass'

/**
 * Why a red is not red: its e2e tests failed but proved nothing, as the failing replay it reports
 * shows (a failing test command makes it red); else every test command passed, then every e2e command.
 * @param {Component[]} components @param {CheckedCommit['replay'] | undefined} replay
 */
const notRed = (components, replay) => (replay?.exitCode ? E2E_ALONE : `the tests of ${names(components)} pass at it${e2ePassed(components.filter(hasE2e))}`)

/** @param {Component[]} played the components whose e2e tests ran */
const e2ePassed = (played) => (played.length === 0 ? '' : `, and so do the e2e tests of ${names(played)}`)

/** @param {Component[]} components */
const names = (components) => components.map(({ name }) => name).join(', ')

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

