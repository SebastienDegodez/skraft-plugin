import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { pathUnder } from '../../domain/config/relative-path.mjs'
import { installerIn, parseCommand, programChoices } from '../../domain/gates/command-line.mjs'
import { redsToReplay } from '../../domain/pipeline/commits.mjs'
import { ownersOf } from '../../domain/pipeline/component-files.mjs'
import { interruptedBy } from '../../domain/pipeline/incidents.mjs'
import { baseOf } from '../config/bases.mjs'
import { judgeCommit } from './replay-judge.mjs'

/**
 * The engine replays a commit's tests in a throwaway checkout and keeps what they printed in the
 * run's logs; a red whose tests fail is replayed at its parent too. The replay judge then reads
 * those logs and decides whether a red fails on its scenario's assertion, or whether a green
 * makes it pass. The engine reads no test report and no output: an exit code of 0 is all it
 * tells apart, and a red whose tests all pass is no red.
 *
 * @typedef {import('../../domain/pipeline/commits.mjs').JudgedCommit} JudgedCommit
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('./replay-judge.mjs').Judgement} Judgement
 * @typedef {import('./replay-judge.mjs').JudgeRun} JudgeRun
 * @typedef {import('../../domain/pipeline/replay-verdict.mjs').ReplayFact} ReplayFact
 * @typedef {import('../../domain/pipeline/incidents.mjs').Incident} Incident
 * @typedef {{ component: string, command: ReplayedCommand, exitCode: number | null, durationMs: number, log: string, judge?: Omit<Judgement, 'why'> }} Replay
 *   log: the file that holds what it printed, absolute; judge: what the replay judge decided on
 *   the commit.
 * @typedef {Map<string, { verdict: string, replay: Replay | null }>} KnownCommits
 * @typedef {{
 *   commitReplay: import('../ports/commit-replay.mjs').CommitReplay,
 *   clock: import('../ports/clock.mjs').Clock,
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   agentRunner: import('../ports/agent-runner.mjs').AgentRunner,
 *   progress: import('../ports/pipeline-progress.mjs').PipelineProgress,
 * }} ReplayDeps
 * @typedef {{ replays: Map<string, Replay | null>, details: Map<string, string>, commands: Map<string, ReplayedCommand>, replayMs: number, judgeCost: number | undefined, incident: Incident | null }} ReplayTally
 *   the replay each commit reports (its first that did not pass, else its last), why a commit is
 *   refused, the command whose replay proved each red, the time spent replaying, what the judge
 *   cost, and what stopped the replays when the judge, a person or the configuration did.
 * @typedef {{
 *   base: import('../config/bases.mjs').Base[], tally: ReplayTally, slug: string, judge: JudgeRun,
 *   scenario: { index: number, title: string } | null, retried: boolean,
 * }} ReplayRun
 *   slug: the run whose logs folder keeps what each replay printed; scenario: the one the pass
 *   works on; retried: the commit's commands run again after the judge asked it.
 * @typedef {{ environment: string } | { environment: null, name: ReplayedCommand, line: string, argv: string[] }} ReplayCommand
 * @typedef {{ component: Component, command: Extract<ReplayCommand, { environment: null }>, replay: Replay, fact: ReplayFact, started: boolean }} Ran
 * @typedef {{ stop: string | null, ran: Ran[] }} Replayed
 * @typedef {'test' | 'e2e'} ReplayedCommand
 * @typedef {{ component: Component, command: ReplayedCommand, red: string, tests: string[] }} GreenScenario
 *   the scenario a green makes pass: its component, the command that proved its red, the sha of
 *   that red and the acceptance-test files it committed.
 */

/** @returns {ReplayTally} */
export const emptyTally = () => ({ replays: new Map(), details: new Map(), commands: new Map(), replayMs: 0, judgeCost: undefined, incident: null })

/**
 * Replays the test command of the component each red commit touches, at that commit, unless an
 * earlier attempt of the pass already did; the judge decides on each red whose tests fail.
 * @param {ReplayDeps} deps @param {ReplayRun} run
 * @param {{ config: import('../../domain/config/skraft-config.mjs').SkraftConfig, judged: JudgedCommit[], known: KnownCommits }} request
 * @returns {Promise<string | null>} why the run stops before the replays settle
 */
export const replayReds = async (deps, run, { config, judged, known }) => {
  for (const red of redsToReplay(judged, config.tdd.replay)) {
    const components = ownersOf(config.components, red.files)
    const earlier = known.get(red.sha)
    const stop = earlier ? reuseEarlier(run.tally, red, { earlier, components }) : await replayRed(deps, run, red, components)
    if (stop !== null) return stop
  }
  return null
}

/**
 * A red an earlier attempt of the pass replayed: what it found stands. A red is replayed only once
 * the commit rules let it, so it touches a component and the earlier attempt kept its replay.
 * @param {ReplayTally} tally @param {JudgedCommit} red
 * @param {{ earlier: { verdict: string, replay: Replay | null }, components: Component[] }} found
 * @returns {null}
 */
const reuseEarlier = (tally, red, { earlier, components }) => {
  const replay = /** @type {Replay} */ (earlier.replay)
  red.verdict = /** @type {JudgedCommit['verdict']} */ (earlier.verdict)
  tally.replays.set(red.sha, replay)
  tally.commands.set(red.sha, replay.command)
  tally.details.set(red.sha, notRedDetail(components, replay))
  return null
}

/**
 * Replays the red: the test command of each component it touches, then, when all pass, the e2e
 * command of those that have one; a red whose commands all pass is no red, one whose commands
 * fail goes to the judge.
 * @param {ReplayDeps} deps @param {ReplayRun} run @param {JudgedCommit} red @param {Component[]} components
 * @returns {Promise<string | null>}
 */
const replayRed = async (deps, run, red, components) => {
  const tested = await replayAt(deps, run, { commit: red, sha: red.sha, suffix: '' }, commandsOf(run.base, components, 'test'))
  if (tested.stop !== null) return tested.stop
  const played = failedOf(tested).length > 0 ? tested : await replayAt(deps, run, { commit: red, sha: red.sha, suffix: '' }, commandsOf(run.base, components.filter(hasE2e), 'e2e'))
  if (played.stop !== null) return played.stop
  const failed = failedOf(played)
  return failed.length === 0 ? passedAtRed(run.tally, red, components) : judgeRed(deps, run, { red, components, failed })
}

/**
 * The red's failing commands replayed at its parent, then the judge's word on the red.
 * @param {ReplayDeps} deps @param {ReplayRun} run
 * @param {{ red: JudgedCommit, components: Component[], failed: Ran[] }} replayed
 * @returns {Promise<string | null>}
 */
const judgeRed = async (deps, run, { red, components, failed }) => {
  const parents = await replayAt(deps, run, { commit: red, sha: red.parent, suffix: '-parent' }, failed)
  if (parents.stop !== null) return parents.stop
  run.tally.commands.set(red.sha, failed[0].replay.command)
  const judgement = await judgeCommit(deps, run.judge, requestOf(run, red, { replays: failed, parents: parents.ran, red: null }))
  return decide(run, { commit: red, judgement, refusal: 'not-red' }, () => replayRed(deps, { ...run, retried: true }, red, components))
}

/**
 * Replays the component's tests at the green commit of a scenario, and its e2e tests when they
 * proved the scenario's red; the judge decides whether the scenario passes and nothing else fails.
 * @param {ReplayDeps} deps @param {ReplayRun} run @param {JudgedCommit} green
 * @param {GreenScenario} scenario
 * @returns {Promise<string | null>} why the run stops before the replay settles
 */
export const replayGreen = async (deps, run, green, scenario) => {
  const played = await replayAt(deps, run, { commit: green, sha: green.sha, suffix: '' }, greenCommands(run.base, scenario))
  if (played.stop !== null) return played.stop
  const judgement = await judgeCommit(deps, run.judge, requestOf(run, green, { replays: played.ran, parents: [], red: redOf(deps, run, scenario) }))
  return decide(run, { commit: green, judgement, refusal: 'not-green' }, () => replayGreen(deps, { ...run, retried: true }, green, scenario))
}

/** @param {import('../config/bases.mjs').Base[]} base @param {GreenScenario} scenario */
const greenCommands = (base, { component, command }) => [
  ...commandsOf(base, [component], 'test'),
  ...(command === 'e2e' ? commandsOf(base, [component], 'e2e') : []),
]

/**
 * The scenario's red as the judge of its green reads it: its sha, and where its replay printed.
 * @param {ReplayDeps} deps @param {ReplayRun} run @param {GreenScenario} scenario
 */
const redOf = ({ files }, { slug }, { component, command, red, tests }) => ({
  sha: red,
  log: files.location(slug, logPath(red, component, command)),
  parentLog: files.location(slug, logPath(red, component, `${command}-parent`)),
  tests,
})

/**
 * What the judge decided, recorded on the commit's replay: accept leaves the commit as it is, a
 * retry runs its commands again once, send-back refuses it, and anything else asks a human.
 * @param {ReplayRun} run @param {{ commit: JudgedCommit, judgement: Judgement, refusal: 'not-red' | 'not-green' }} judged
 * @param {() => Promise<string | null>} again
 * @returns {Promise<string | null>}
 */
const decide = (run, { commit, judgement, refusal }, again) => {
  recordJudgement(run.tally, commit.sha, judgement)
  if (judgement.decision === 'retry' && !run.retried) return retried(run.tally, commit, again)
  if (judgement.decision === 'accept') return Promise.resolve(null)
  return Promise.resolve(judgement.decision === 'send-back' ? refuse(run.tally, commit, refusal, judgement) : askHuman(run.tally, commit, judgement))
}

/**
 * The commit's commands run again: what the commit reports is what the retry finds.
 * @param {ReplayTally} tally @param {JudgedCommit} commit @param {() => Promise<string | null>} again
 */
const retried = (tally, commit, again) => {
  tally.replays.delete(commit.sha)
  return again()
}

/** @param {ReplayTally} tally @param {string} sha @param {Judgement} judgement */
const recordJudgement = (tally, sha, { why, ...judge }) => {
  tally.replays.set(sha, { .../** @type {Replay} */ (tally.replays.get(sha)), judge })
  if (judge.cost !== undefined) tally.judgeCost = (tally.judgeCost ?? 0) + judge.cost
}

/** @param {ReplayTally} tally @param {JudgedCommit} commit @param {'not-red' | 'not-green'} refusal @param {Judgement} judgement @returns {null} */
const refuse = (tally, commit, refusal, judgement) => {
  commit.verdict = refusal
  tally.details.set(commit.sha, sentBack(/** @type {string} */ (judgement.answer)))
  return null
}

/** @param {ReplayTally} tally @param {JudgedCommit} commit @param {Judgement} judgement @returns {string} */
const askHuman = (tally, commit, { answer, why }) => {
  tally.incident = { owner: 'judge', log: answer }
  return `the replay judge asks a human about the ${commit.kind} commit ${commit.sha.slice(0, 7)}: ${why ?? `read ${answer}`}`
}

/** @param {string} answer */
const sentBack = (answer) => `the replay judge sends it back: read ${answer}`

/**
 * @param {ReplayRun} run @param {JudgedCommit} commit
 * @param {{ replays: Ran[], parents: Ran[], red: import('../../domain/pipeline/replay-verdict.mjs').JudgeRequest['red'] }} facts
 * @returns {import('../../domain/pipeline/replay-verdict.mjs').JudgeRequest}
 */
const requestOf = ({ scenario, retried }, { kind, sha, subject, repository, files }, { replays, parents, red }) => ({
  kind: kind === 'red' ? 'red' : 'green', sha, subject, repository, files, scenario, retried, red,
  replays: replays.map(({ fact }) => fact),
  parents: parents.map(({ fact }) => fact),
})

/**
 * Runs each command at one sha, the commit's or its parent's; the first the configuration gives
 * wrong or a person interrupts stops the others. The commit's own replays are what it reports.
 * @param {ReplayDeps} deps @param {ReplayRun} run
 * @param {{ commit: JudgedCommit, sha: string, suffix: string }} at suffix: what the log's name adds for a parent
 * @param {Array<{ component: Component, command: ReplayCommand }>} commands
 * @returns {Promise<Replayed>}
 */
const replayAt = async (deps, run, at, commands) => {
  /** @type {Ran[]} */
  const ran = []
  for (const { component, command } of commands) {
    if (command.environment !== null) return { stop: configured(run.tally, command.environment), ran }
    const one = await timedRun(deps, run, { repository: at.commit.repository, sha: at.sha, component, command, log: logPath(at.commit.sha, component, `${command.name}${at.suffix}`) })
    if (!one.started) return { stop: configured(run.tally, `${command.line} could not start; change it in ${CONFIG_FILE}`, one.fact.log), ran }
    if (interruptedBy(/** @type {number} */ (one.replay.exitCode))) return { stop: interrupted(run.tally, one), ran }
    if (at.suffix === '') reportReplay(run.tally, at.commit.sha, one.replay)
    ran.push(one)
  }
  return { stop: null, ran }
}

/** @param {Replayed} replayed */
const failedOf = ({ ran }) => ran.filter(({ replay }) => replay.exitCode !== 0)

/**
 * @param {import('../config/bases.mjs').Base[]} base @param {Component[]} components @param {ReplayedCommand} name
 * @returns {Array<{ component: Component, command: ReplayCommand }>}
 */
const commandsOf = (base, components, name) => components.map((component) => ({ component, command: name === 'test' ? testCommandOf(base, component) : parsedCommand(base, component, name) }))

/** @param {Component} component */
const hasE2e = (component) => component.commands.e2e !== undefined

/**
 * A command the configuration gives that the engine cannot replay: the configuration's to fix.
 * @param {ReplayTally} tally @param {string} reason @returns {string}
 */
const configured = (tally, reason, log = null) => {
  tally.incident = { owner: 'config', log }
  return reason
}

/** A person interrupted a replay (Ctrl-C): the run stops there. @param {ReplayTally} tally @param {Ran} one @returns {string} */
const interrupted = (tally, { component, command, fact }) => {
  tally.incident = { owner: 'interrupted', log: fact.log }
  return `replaying ${fact.sha.slice(0, 7)} for ${component.name}: ${command.line} was interrupted by a person (exit ${fact.exitCode})`
}

/** A red whose commands all pass is no red. @param {ReplayTally} tally @param {JudgedCommit} red @param {Component[]} components @returns {null} */
const passedAtRed = (tally, red, components) => {
  red.verdict = 'not-red'
  tally.details.set(red.sha, notRedDetail(components, /** @type {Replay} */ (tally.replays.get(red.sha))))
  return null
}

/**
 * Why a red is not red: the judge sent it back, else every test command passed, then every e2e command.
 * @param {Component[]} components @param {Replay} replay the replay it reports
 */
const notRedDetail = (components, replay) => (replay.judge?.decision === 'send-back'
  ? sentBack(/** @type {string} */ (replay.judge.answer))
  : `the tests of ${names(components)} pass at it${e2ePassed(components.filter(hasE2e))}; the replay's output is in ${replay.log}`)

/** @param {Component[]} played the components whose e2e tests ran */
const e2ePassed = (played) => (played.length === 0 ? '' : `, and so do the e2e tests of ${names(played)}`)

/** @param {Component[]} components */
const names = (components) => components.map(({ name }) => name).join(', ')

/**
 * The replay a commit reports: its first that did not pass, else its last.
 * @param {ReplayTally} tally @param {string} sha @param {Replay} replay
 */
const reportReplay = (tally, sha, replay) => {
  const reported = tally.replays.get(sha)
  if (!reported || reported.exitCode === 0) tally.replays.set(sha, replay)
}

/**
 * The argv that runs a component's tests; the environment reason when it has none that parses.
 * @param {import('../config/bases.mjs').Base[]} base @param {Component} component
 * @returns {ReplayCommand}
 */
const testCommandOf = (base, component) => {
  if (component.commands.test === undefined) return { environment: `component ${component.name} has no test command; add commands.test to it in ${CONFIG_FILE} so test commits can be replayed` }
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
 * starts, as the gates run it (`python`: the component's virtual environment first); its time
 * counts as replaying. What it printed goes to a log of the run, named by the commit judged, the
 * component and the command, `-parent` added for a replay at its parent.
 * @param {ReplayDeps} deps @param {ReplayRun} run
 * @param {{ repository: string, sha: string, component: Component, command: Extract<ReplayCommand, { environment: null }>, log: string }} replay log: where it prints, in the run's folder
 * @returns {Promise<Ran>}
 */
const timedRun = async (deps, run, { repository, sha, component, command, log: path }) => {
  const started = deps.clock.now()
  const cwd = /** @type {string} */ (pathUnder(component.root, repository))
  await deps.files.clearTemporary(run.slug)
  const tmp = deps.files.location(run.slug, '.tmp')
  const env = { TMPDIR: tmp, TEMP: tmp, TMP: tmp }
  const answer = await deps.commitReplay.run({ repository, sha, cwd, choices: programChoices(command.argv), importRoots: importRootsOf(component), env, javaTmpDir: tmp })
  const durationMs = deps.clock.now().getTime() - started.getTime()
  run.tally.replayMs += durationMs
  const log = await writeLog(deps, run.slug, { sha, component, argv: command.argv, path }, answer)
  return ranOf({ component, command, sha }, { started: answer.started, exitCode: answer.exitCode, error: answer.error, durationMs, log })
}

/**
 * A replay as the commit reports it, and as the judge reads it.
 * @param {{ component: Component, command: Extract<ReplayCommand, { environment: null }>, sha: string }} at
 * @param {{ started: boolean, exitCode: number | null, error?: string, durationMs: number, log: string }} ended
 * @returns {Ran}
 */
const ranOf = ({ component, command, sha }, { started, exitCode, error, durationMs, log }) => ({
  component, command, started,
  replay: { component: component.name, command: command.name, exitCode, durationMs, log },
  fact: { component: component.name, line: command.line, sha, exitCode, ...(exitCode === null ? { error } : {}), log },
})

/** @param {string} sha @param {Component} component @param {string} label */
const logPath = (sha, component, label) => `logs/replay-${sha.slice(0, 7)}-${component.name}-${label}.log`

/**
 * Writes what a replay printed under the run's logs folder, as it printed it; returns where, absolute.
 * @param {ReplayDeps} deps @param {string} slug
 * @param {{ sha: string, component: Component, argv: string[], path: string }} replay sha: the commit replayed; path: the log's, in the run's folder
 * @param {import('../ports/command-runner.mjs').CommandResult} answer
 */
const writeLog = async ({ files }, slug, { sha, component, argv, path }, answer) => {
  await files.write(slug, path, [`$ ${argv.join(' ')}`, `cwd: ${component.root}`, `commit: ${sha}`, `exit: ${answer.exitCode ?? answer.error}`, '--- stdout', answer.stdout, '--- stderr', answer.stderr, ''].join('\n'))
  return files.location(slug, path)
}

/**
 * A Python component's source folders, which come first on the replayed program's import path:
 * an editable install in the virtual environment the replay links would import the working
 * copy's code instead of the commit's. None for another stack.
 * @param {Component} component @returns {string[]}
 */
const importRootsOf = (component) => (component.stack === 'python' ? component.paths.src : [])

/** @param {JudgedCommit[]} judged @param {Map<string, Replay | null>} replays */
export const report = (judged, replays) => judged
  .map(({ repository, sha, subject, kind, verdict }) => ({ repository, sha, subject, kind, verdict, replay: replays.get(sha) ?? null }))
