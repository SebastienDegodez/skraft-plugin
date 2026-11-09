import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { pathUnder } from '../../domain/config/relative-path.mjs'
import { installerIn, parseCommand, programChoices } from '../../domain/gates/command-line.mjs'
import { failureOf } from '../../domain/gates/gate-plan.mjs'
import { redsToReplay } from '../../domain/pipeline/commits.mjs'
import { isCode, ownersOf } from '../../domain/pipeline/component-files.mjs'
import { failingIds, notGreenBecause, notRedBecause, readReplay } from '../../domain/pipeline/junit.mjs'
import { baseOf } from '../config/bases.mjs'

/**
 * The engine replays a commit's tests in a throwaway checkout and reads the JUnit reports they
 * write: a red of an acceptance test must fail on an assertion, a green of a scenario must make
 * its acceptance tests pass with nothing failing.
 *
 * @typedef {import('../../domain/pipeline/commits.mjs').JudgedCommit} JudgedCommit
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('../../domain/pipeline/junit.mjs').Reading} Reading
 * @typedef {{ component: string, command: ReplayedCommand, exitCode: number | null, durationMs: number, reading?: Reading, tests?: string[] }} Replay
 *   reading: what its reports prove; tests: the test cases that failed on an assertion.
 * @typedef {Map<string, { verdict: string, replay: Replay | null }>} KnownCommits
 * @typedef {{
 *   commitReplay: import('../ports/commit-replay.mjs').CommitReplay,
 *   clock: import('../ports/clock.mjs').Clock,
 * }} ReplayDeps
 * @typedef {{ replays: Map<string, Replay | null>, details: Map<string, string>, tests: Map<string, string[]>, commands: Map<string, ReplayedCommand>, replayMs: number }} ReplayTally
 *   the replay each commit reports (its first that did not pass, else its last), why a commit is
 *   refused, the test cases each proven red failed and the command whose reports proved it, the time spent.
 * @typedef {{ base: import('../config/bases.mjs').Base[], tally: ReplayTally }} ReplayRun
 * @typedef {{ environment: string } | { environment: null, proven: boolean, reading: Reading | null }} ComponentReplay
 * @typedef {{ environment: string } | { environment: null, name: ReplayedCommand, line: string, argv: string[] }} ReplayCommand
 * @typedef {'test' | 'e2e'} ReplayedCommand
 */

/** @returns {ReplayTally} */
export const emptyTally = () => ({ replays: new Map(), details: new Map(), tests: new Map(), commands: new Map(), replayMs: 0 })

/**
 * Replays the test command of the component each red commit touches, at that commit, unless an
 * earlier attempt of the pass already did. A red that does not fail on an assertion is refused;
 * a machine that cannot run the tests stops the check.
 * @param {ReplayDeps} deps @param {ReplayTally} tally
 * @param {{ config: import('../../domain/config/skraft-config.mjs').SkraftConfig, base: import('../config/bases.mjs').Base[], judged: JudgedCommit[], known: KnownCommits }} request
 * @returns {Promise<string | null>} why the machine could not replay one
 */
export const replayReds = async (deps, tally, { config, base, judged, known }) => {
  for (const red of redsToReplay(judged, config.tdd.replay)) {
    const environment = await settleRed(deps, { base, known, tally, components: config.components }, red)
    if (environment !== null) return environment
  }
  return null
}

/**
 * Settles one red commit: from an earlier attempt, as touching no component, or by replaying it.
 * @param {ReplayDeps} deps
 * @param {{ base: import('../config/bases.mjs').Base[], known: KnownCommits, tally: ReplayTally, components: Component[] }} run
 * @param {JudgedCommit} red
 * @returns {Promise<string | null>}
 */
const settleRed = async (deps, { base, known, tally, components }, red) => {
  const touched = ownersOf(components, red.files)
  const earlier = known.get(red.sha)
  if (earlier) return reuseEarlier(tally, red, { earlier: /** @type {{ verdict: string, replay: Replay }} */ (earlier), components: touched })
  return replayRed(deps, { base, tally }, red, touched)
}

/**
 * A red an earlier attempt of the pass replayed: what it found stands. A red is replayed only once
 * the commit rules let it, so it touches a component and the earlier attempt kept its replay.
 * @param {ReplayTally} tally @param {JudgedCommit} red
 * @param {{ earlier: { verdict: string, replay: Replay }, components: Component[] }} found
 * @returns {null}
 */
const reuseEarlier = (tally, red, { earlier, components }) => {
  red.verdict = /** @type {import('../../domain/pipeline/commits.mjs').CommitVerdict} */ (earlier.verdict)
  tally.replays.set(red.sha, earlier.replay)
  // a red not proven left no tests, and only a proven red becomes its scenario's oracle
  proved(tally, { sha: red.sha, command: earlier.replay.command, ids: /** @type {string[]} */ (earlier.replay.tests) })
  tally.details.set(red.sha, notRed(components, earlier.replay))
  return null
}

/**
 * Replays the red: the test command of each component it touches, then, when none fails on an
 * assertion, the e2e command of those that have one; refuses it when none does.
 * @param {ReplayDeps} deps @param {ReplayRun} run @param {JudgedCommit} red @param {Component[]} components
 * @returns {Promise<string | null>}
 */
const replayRed = async (deps, run, red, components) => {
  const tested = await replayEach(deps, run, red, components.map((component) => ({ component, command: testCommandOf(run.base, component) })))
  if (tested.environment !== null || tested.proven) return tested.environment
  const played = await replayEach(deps, run, red, components.filter(hasE2e).map((component) => ({ component, command: parsedCommand(run.base, component, 'e2e') })))
  if (played.environment === null && !played.proven) markNotRed(run.tally, red, components)
  return played.environment
}

/**
 * Runs each command at the red commit; the first the machine cannot run stops the others.
 * @param {ReplayDeps} deps @param {ReplayRun} run @param {JudgedCommit} red
 * @param {Array<{ component: Component, command: ReplayCommand }>} commands
 * @returns {Promise<{ environment: string } | { environment: null, proven: boolean }>}
 */
const replayEach = async (deps, run, red, commands) => {
  let proven = false
  for (const { component, command } of commands) {
    const replay = await replayCommand(deps, run.tally, { red, component, command })
    if (replay.environment !== null) return replay
    proven ||= replay.proven
  }
  return { environment: null, proven }
}

/** @param {Component} component */
const hasE2e = (component) => component.commands.e2e !== undefined

/** @param {ReplayTally} tally @param {JudgedCommit} red @param {Component[]} components */
const markNotRed = (tally, red, components) => {
  red.verdict = 'not-red'
  tally.details.set(red.sha, notRed(components, /** @type {Replay} */ (tally.replays.get(red.sha))))
}

/**
 * Runs one command of a component at the red commit, reads what its reports prove; a command
 * the machine stops or cannot start, or tests no container runtime could run, are no failure of
 * the tests; an e2e failure its parent shows proves nothing.
 * @param {ReplayDeps} deps @param {ReplayTally} tally
 * @param {{ red: JudgedCommit, component: Component, command: ReplayCommand }} replay
 * @returns {Promise<ComponentReplay>}
 */
const replayCommand = async (deps, tally, { red, component, command }) => {
  if (command.environment !== null) return command
  const answer = await timedRun(deps, tally, { repository: red.repository, sha: red.sha, component, argv: command.argv })
  const read = readReplay(answer, red.files.filter((file) => isCode(file, [component], ['tests'])))
  reportReplay(tally, red.sha, { component: component.name, command: command.name, exitCode: answer.exitCode, durationMs: answer.durationMs, reading: read.reading, ...provenTests(read) })
  const machine = machineReason({ sha: red.sha, component, line: command.line }, answer, read.reading)
  if (machine !== null) return { environment: machine }
  if (read.reading !== 'assertion') return { environment: null, proven: false, reading: read.reading }
  const proof = command.name === 'test' ? PROVEN : await failureAtParent(deps, tally, { red, component, command })
  return proof === PROVEN ? proved(tally, { sha: red.sha, command: command.name, ids: failingIds(read.cases) }) : proof
}

/**
 * A red proven: the test cases that failed on an assertion and the command whose reports hold
 * them, which the green of its scenario replays.
 * @param {ReplayTally} tally @param {{ sha: string, command: ReplayedCommand, ids: string[] }} proof
 * @returns {ComponentReplay}
 */
const proved = (tally, { sha, command, ids }) => {
  tally.tests.set(sha, ids)
  tally.commands.set(sha, command)
  return PROVEN
}

/** @param {{ reading: Reading, cases: import('../../domain/pipeline/junit.mjs').TestCase[] }} read */
const provenTests = ({ reading, cases }) => (reading === 'assertion' ? { tests: failingIds(cases) } : {})

/**
 * Why the machine, not the commit, ended the replay: a program that could not start or was
 * stopped (a timeout aside, which the commit answers for), tests that need a container runtime
 * none of which answers; null when the tests ran.
 * @param {{ sha: string, component: Component, line: string }} at
 * @param {import('../ports/command-runner.mjs').CommandResult} answer @param {Reading} reading
 */
const machineReason = ({ sha, component, line }, answer, reading) => {
  const where = `replaying ${sha.slice(0, 7)} for ${component.name}`
  if (reading === 'indeterminate') return `${where}: no container runtime answers (Docker or Podman), so the tests that need one could not run; start Docker or Podman, then retry`
  if (reading === 'timeout' || failureOf(answer) !== 'environment') return null
  return `${where}: ${answer.error ?? `${line} exited ${answer.exitCode}`}`
}

/** A red proven. @type {ComponentReplay} */
const PROVEN = Object.freeze({ environment: null, proven: true, reading: 'assertion' })
/** An e2e failure its parent shows too, for a reason the agent can act on: it proves nothing. @type {ComponentReplay} */
const UNPROVEN = Object.freeze({ environment: null, proven: false, reading: 'assertion' })
/** What Playwright prints when it finds no test to run, and exits 1. */
const NO_TESTS = /No tests found/

/**
 * An e2e failure proves the red only when the e2e tests pass at the commit's parent: a machine
 * that cannot run them (no browser, a busy port, missing dependencies) fails them there too. A
 * parent that is a red commit of the pass is not replayed again: its e2e replay tells.
 * @param {ReplayDeps} deps @param {ReplayTally} tally
 * @param {{ red: JudgedCommit, component: Component, command: { line: string, argv: string[] } }} replay
 * @returns {Promise<ComponentReplay>}
 */
const failureAtParent = async (deps, tally, replay) => {
  const known = tally.replays.get(replay.red.parent)
  if (known?.command === 'e2e' && known.component === replay.component.name) return known.exitCode === 0 ? PROVEN : UNPROVEN
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
  if (failure === null) return PROVEN
  const at = `replaying ${red.sha.slice(0, 7)} for ${component.name}: ${command.line}`
  if (failure === 'environment') return { environment: `${at} could not run at its parent, so its failure proves nothing; fix the machine, then retry` }
  if (NO_TESTS.test(`${answer.stdout}\n${answer.stderr}`)) return UNPROVEN
  return { environment: `${at} fails at its parent too, so its failure proves nothing; make ${command.line} pass at that parent on this machine, then retry` }
}

/**
 * Replays the component's tests at the green commit of a scenario, and its e2e tests when they
 * proved the scenario's red: the scenario's acceptance tests pass, nothing fails and every command
 * exits 0, else the green is refused.
 * @param {ReplayDeps} deps @param {ReplayRun} run @param {JudgedCommit} green
 * @param {{ component: Component, tests: string[], command: ReplayedCommand }} scenario
 * @returns {Promise<string | null>} why the machine could not replay it
 */
export const replayGreen = async (deps, run, green, { component, tests, command }) => {
  const commands = [testCommandOf(run.base, component), ...(command === 'e2e' ? [parsedCommand(run.base, component, 'e2e')] : [])]
  const ran = { cases: /** @type {import('../../domain/pipeline/junit.mjs').TestCase[]} */ ([]), exits: /** @type {string[]} */ ([]) }
  for (const replayed of commands) {
    const answer = await replayGreenCommand(deps, run.tally, { green, component, command: replayed })
    if (typeof answer === 'string') return answer
    ran.cases.push(...answer.cases)
    ran.exits.push(...answer.exit)
  }
  return judgeGreen(run.tally, green, ran.cases.length === 0 ? notRedBecause('no-report') : notGreenBecause(ran.cases, tests) ?? ran.exits[0] ?? null)
}

/**
 * The test cases one command's reports hold at the green and how it exited; a string when the
 * machine ended it.
 * @param {ReplayDeps} deps @param {ReplayTally} tally
 * @param {{ green: JudgedCommit, component: Component, command: ReplayCommand }} replay
 * @returns {Promise<string | { cases: import('../../domain/pipeline/junit.mjs').TestCase[], exit: string[] }>}
 */
const replayGreenCommand = async (deps, tally, { green, component, command }) => {
  // Stryker disable next-line ConditionalExpression: the red of the scenario already ran this command, so a component without a test command never reaches its green
  if (command.environment !== null) return command.environment
  const answer = await timedRun(deps, tally, { repository: green.repository, sha: green.sha, component, argv: command.argv })
  const read = readReplay(answer)
  reportReplay(tally, green.sha, { component: component.name, command: command.name, exitCode: answer.exitCode, durationMs: answer.durationMs, reading: read.reading })
  return machineReason({ sha: green.sha, component, line: command.line }, answer, read.reading) ?? { cases: read.cases, exit: answer.exitCode === 0 ? [] : [`${command.line} exits ${answer.exitCode}`] }
}

/** @param {ReplayTally} tally @param {JudgedCommit} green @param {string | null} why @returns {null} */
const judgeGreen = (tally, green, why) => {
  if (why === null) return null
  green.verdict = 'not-green'
  tally.details.set(green.sha, why)
  return null
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
 * Runs a program on a commit's files from a component's folder, the first of its choices that
 * starts, as the gates run it (`python`: the component's virtual environment first), and reads
 * the JUnit reports the component's tests write; its time counts as replaying.
 * @param {ReplayDeps} deps @param {ReplayTally} tally
 * @param {{ repository: string, sha: string, component: Component, argv: string[] }} run
 */
const timedRun = async (deps, tally, { repository, sha, component, argv }) => {
  const started = deps.clock.now()
  const cwd = /** @type {string} */ (pathUnder(component.root, repository))
  const answer = await deps.commitReplay.run({ repository, sha, cwd, choices: programChoices(argv), importRoots: importRootsOf(component), reports: component.testReports })
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
 * @param {ReplayTally} tally @param {string} sha @param {Replay} replay
 */
const reportReplay = (tally, sha, replay) => {
  const reported = tally.replays.get(sha)
  if (!reported || reported.exitCode === 0) tally.replays.set(sha, replay)
}

/** Why its failing e2e tests do not make a commit red. */
const E2E_ALONE = 'its failing e2e tests prove nothing alone: they fail at its parent too, a test commit of this pass or one with no e2e test yet; commit them all in one commit, or with a failing unit test, or with the code that makes them pass'

/**
 * Why a red is not red: its e2e tests failed but proved nothing (a test command failing on an
 * assertion proves the red); its reports prove no assertion failing (no report, an error, a
 * skipped test, a timeout); else every test command passed, then every e2e command.
 * @param {Component[]} components @param {Replay} replay the replay it reports
 */
const notRed = (components, replay) => {
  if (replay.reading === 'assertion') return E2E_ALONE
  return refusedReading(/** @type {Reading} */ (replay.reading)) ?? `the tests of ${names(components)} pass at it${e2ePassed(components.filter(hasE2e))}`
}

/** The readings whose refusal says which tests pass, rather than why none failed on an assertion. */
const PASSING = Object.freeze(['green', 'assertion', 'indeterminate'])

/** Why the reports prove no assertion failing; null when the tests passed. @param {Reading} reading */
const refusedReading = (reading) => (PASSING.includes(reading) ? null : notRedBecause(/** @type {Parameters<typeof notRedBecause>[0]} */ (reading)))

/** @param {Component[]} played the components whose e2e tests ran */
const e2ePassed = (played) => (played.length === 0 ? '' : `, and so do the e2e tests of ${names(played)}`)

/** @param {Component[]} components */
const names = (components) => components.map(({ name }) => name).join(', ')

/** @param {JudgedCommit[]} judged @param {Map<string, Replay | null>} replays */
export const report = (judged, replays) => judged
  .map(({ repository, sha, subject, kind, verdict }) => ({ repository, sha, subject, kind, verdict, replay: replays.get(sha) ?? null }))
