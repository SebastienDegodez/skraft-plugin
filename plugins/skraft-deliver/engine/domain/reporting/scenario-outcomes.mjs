/**
 * What each scenario of the story is proven to do, from the journal and the signed trace of the
 * delivery alone: a scenario is `passed` only when its acceptance test stayed as its red commit
 * holds it, a green commit delivered its group, and the whole test suite of its component, the
 * last traced `test` run under it, passed on the final commit. Anything else is `not proven`,
 * with why; nothing passes by default. Delivered is not deployed.
 *
 * @typedef {import('../journal/run-state.mjs').Scenarios} Scenarios
 * @typedef {{ sha: string, kind: string, verdict: string }} CheckedCommit
 * @typedef {{
 *   run: number, exitCode: number | null, killed: boolean, timedOut: boolean, started: boolean,
 *   headAfter: string | null, durationMs: number, log: string,
 * }} SuiteRun
 * @typedef {{ final: string | null, verified: boolean, run: SuiteRun | null, log: string | null }} ComponentSuite
 *   final: the commit HEAD is on in the component's repository; verified: the delivery's trace
 *   reads through its signatures; run: the last traced `test` run under the component, null for
 *   none; log: that run's log, null when the tracking folder lost it.
 * @typedef {{
 *   index: number, title: string, component: string, ac: string[], red: string | null, green: string | null,
 *   suite: { run: number, sha: string, durationMs: number } | null, named: boolean | null,
 *   status: 'passed' | 'not proven', reason: string,
 * }} ScenarioOutcome
 *   ac: its acceptance-criteria tags (`@AC-1`); red, green: the short shas of the commit holding its
 *   acceptance test and of the green that delivered its group; suite: the run of the whole suite it
 *   stands on; named: whether that run's log names its test (`S<n>_`), null without a log; reason:
 *   why it is not proven, '' when it passed.
 */

/** The statuses a scenario may have. */
export const PASSED = 'passed'
export const NOT_PROVEN = 'not proven'

/**
 * @param {{ scenarios: Scenarios | null, commits: CheckedCommit[], suites: Record<string, ComponentSuite> }} facts
 * @returns {ScenarioOutcome[]}
 */
export const scenarioOutcomes = ({ scenarios, commits, suites }) => (scenarios === null
  ? []
  : scenarios.list.map((scenario) => outcomeOf(scenario, { scenarios, commits, suite: suites[scenario.component] ?? null })))

/**
 * @param {import('../pipeline/scenarios.mjs').StoryScenario} scenario
 * @param {{ scenarios: Scenarios, commits: CheckedCommit[], suite: ComponentSuite | null }} facts
 * @returns {ScenarioOutcome}
 */
const outcomeOf = (scenario, facts) => {
  const red = facts.scenarios.oracles[scenario.index] ?? null
  const green = deliveredBy(scenario, facts)
  const proof = { red: red === null ? null : short(red.sha), green: green === null ? null : short(green), ...suiteProof(scenario, facts.suite) }
  const reason = [redGap(red, facts.commits), green === null ? 'no green commit delivered its group' : '', suiteGap(facts.suite)].find((gap) => gap !== '') ?? ''
  return { index: scenario.index, title: scenario.title, component: scenario.component, ac: acOf(scenario.tags), ...proof, status: reason === '' ? PASSED : NOT_PROVEN, reason }
}

/** @param {string} sha */
const short = (sha) => sha.slice(0, 7)

/** Acceptance-criteria tags: `@AC-1`, `@ac2`, `@AC_3`. */
const AC = /^@ac[-_.:]?\d/i

/** @param {string[]} tags */
const acOf = (tags) => tags.filter((tag) => AC.test(tag))

/**
 * Why the acceptance test is not the red commit's: none holds it, or a later commit changed an
 * acceptance test of the story (the engine's verdict names no file); '' when it stands.
 * @param {import('../journal/run-state.mjs').Oracle | null} red @param {CheckedCommit[]} commits
 */
const redGap = (red, commits) => {
  if (red === null) return 'no red commit holds its acceptance test'
  return commits.some((commit) => commit.verdict === 'oracle-touched') ? 'an acceptance test changed after its red commit' : ''
}

/**
 * The green commit that delivered the scenario's group: the last accepted green, once the
 * delivery passed that group; null otherwise.
 * @param {import('../pipeline/scenarios.mjs').StoryScenario} scenario @param {{ scenarios: Scenarios, commits: CheckedCommit[] }} facts
 */
const deliveredBy = ({ index }, { scenarios, commits }) => {
  const green = commits.findLast((commit) => commit.kind === 'green' && commit.verdict === 'ok')
  const group = scenarios.groups.find(({ scenarios: numbers }) => numbers.includes(index))
  const delivered = group === undefined || group.index <= scenarios.delivered
  return green !== undefined && delivered ? green.sha : null
}

/**
 * Why the whole suite of the component does not prove it: no trace to trust, no run, a run on
 * another commit, a run that did not pass; '' when it does.
 * @param {ComponentSuite | null} suite
 */
const suiteGap = (suite) => {
  if (suite === null || !suite.verified) return 'the trace of the delivery cannot be verified'
  if (suite.run === null) return 'no traced run of the whole test suite of its component'
  if (!onFinal(suite)) return 'the whole test suite did not run on the final commit'
  return passedRun(suite.run) ? '' : 'the whole test suite failed on the final commit'
}

/** @param {ComponentSuite} suite */
const onFinal = ({ final, run }) => final !== null && run !== null && run.headAfter !== null && run.headAfter === final

/** @param {SuiteRun} run */
const passedRun = ({ started, exitCode, killed, timedOut }) => started && exitCode === 0 && !killed && !timedOut

/**
 * The run the scenario stands on, and whether its log names the scenario's test.
 * @param {import('../pipeline/scenarios.mjs').StoryScenario} scenario @param {ComponentSuite | null} suite
 */
const suiteProof = ({ index }, suite) => {
  if (suite === null || suite.run === null || !suite.verified) return { suite: null, named: null }
  const { run, headAfter, durationMs } = suite.run
  return { suite: { run, sha: headAfter === null ? '' : short(headAfter), durationMs }, named: suite.log === null ? null : namedIn(suite.log, index) }
}

/**
 * Whether a log names the scenario's test: `S<n>_`, or `test_S<n>_`, not inside a longer word,
 * whatever the case.
 * @param {string} log @param {number} index
 */
const namedIn = (log, index) => new RegExp(`(?<![A-Za-z0-9])(?:test_)?S${index}_`, 'i').test(log)
