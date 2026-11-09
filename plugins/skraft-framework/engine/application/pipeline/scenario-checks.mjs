import { commitName } from '../../domain/pipeline/commits.mjs'
import { isCode, ownersOf } from '../../domain/pipeline/component-files.mjs'
import { readScenarioPlan } from '../../domain/pipeline/scenarios.mjs'
import { scenarioNodes } from '../../domain/workflow/workflow.mjs'
import { replayGreen } from './commit-replays.mjs'

/**
 * What the engine checks on a pass of a story built scenario by scenario: the scenarios the
 * acceptance designer's test plan lists, one red of a scenario's acceptance test, one green that
 * makes it pass without touching it, a walking skeleton declared exempt as docs only that no
 * commit contradicts; and what the pass leaves for the next ones.
 *
 * @typedef {import('../../domain/pipeline/scenarios.mjs').ScenarioPlan} ScenarioPlan
 * @typedef {import('../../domain/pipeline/scenarios.mjs').StoryScenario} StoryScenario
 * @typedef {import('../../domain/journal/run-state.mjs').Oracle} Oracle
 * @typedef {import('../../domain/pipeline/commits.mjs').JudgedCommit} JudgedCommit
 * @typedef {import('../../domain/pipeline/commits.mjs').ScenarioJudging} ScenarioJudging
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {{
 *   kind: 'plan' | 'oracle' | 'delivery', index: number, of: number, scenario: StoryScenario | null,
 *   oracles: Oracle[], exemption: import('../../domain/pipeline/scenarios.mjs').Exemption,
 * }} ScenarioPass
 *   plan: the pass that writes the story's scenarios and the red of the first; oracle: the red of
 *   scenario `index`; delivery: its green. of: how many scenarios the last plan lists; oracles:
 *   the reds committed so far, those of scenarios 1 to `index`: a red is committed only once the
 *   scenario before it passes; exemption: the walking skeleton's, as the last plan declared it.
 * @typedef {{ code: 'scenarios' | 'tdd', line: string }} ScenarioFailure
 * @typedef {{ scenarios?: StoryScenario[], exemption?: string, oracle?: Oracle, green?: { scenario: number } }} ScenarioRecord
 *   what a done pass journals for the passes after it.
 */

/**
 * The scenario a pass of a node marked each="scenario" works on: the plan and the first red on
 * the oracle node's pass with none, scenario `group` otherwise; null on a pass of the delivery
 * node with none, and on any other node.
 * @param {import('../../domain/workflow/workflow.mjs').Workflow} workflow
 * @param {import('../../domain/journal/run-state.mjs').RunState} run
 * @param {{ node: import('../../domain/workflow/workflow.mjs').WorkflowNode, group: number | null }} next
 * @returns {ScenarioPass | null}
 */
export const scenarioPassOf = (workflow, run, { node, group }) => {
  if (node.each !== 'scenario') return null
  const delivery = node.id !== scenarioNodes(workflow)[0]
  if (delivery && group === null) return null
  return passOn(run.scenarios ?? NO_SCENARIOS, passKind(delivery, group), group ?? 1)
}

/** What a run that recorded no scenario yet holds. @type {NonNullable<import('../../domain/journal/run-state.mjs').RunState['scenarios']>} */
const NO_SCENARIOS = Object.freeze({ list: [], exemption: 'none', oracles: {}, delivered: 0 })

/**
 * @param {NonNullable<import('../../domain/journal/run-state.mjs').RunState['scenarios']>} scenarios
 * @param {ScenarioPass['kind']} kind @param {number} index @returns {ScenarioPass}
 */
const passOn = ({ list, exemption, oracles }, kind, index) => ({ kind, index, of: list.length, scenario: list[index - 1] ?? null, oracles: Object.values(oracles), exemption })

/** @param {boolean} delivery @param {number | null} group @returns {ScenarioPass['kind']} */
const passKind = (delivery, group) => {
  if (delivery) return 'delivery'
  return group === null ? 'plan' : 'oracle'
}

/**
 * The scenario plan of the acceptance designer's test plan, on the pass that writes it; nothing
 * on another pass, or while the test plan is missing.
 * @param {{ files: import('../ports/tracking-files.mjs').TrackingFiles }} deps
 * @param {{ slug: string, components: Component[] }} run
 * @param {{ scenario: ScenarioPass | null, outputs: string[] }} step @param {string[]} missing
 * @returns {Promise<{ plan: ScenarioPlan | null, failures: ScenarioFailure[] }>}
 */
export const planOf = async ({ files }, { slug, components }, { scenario, outputs }, missing) => {
  if (scenario?.kind !== 'plan' || missing.includes(outputs[0])) return { plan: null, failures: [] }
  const read = readScenarioPlan({ path: outputs[0], text: /** @type {string} */ (await files.read(slug, outputs[0])) }, components)
  return read.ok ? { plan: read.plan, failures: [] } : { plan: null, failures: read.failures.map((line) => ({ code: 'scenarios', line })) }
}

/**
 * What the commit rules need of the scenario a pass works on.
 * @param {ScenarioPass | null} scenario @param {ScenarioPlan | null} plan @param {Component[]} components
 * @returns {ScenarioJudging | null}
 */
export const scenarioJudging = (scenario, plan, components) => {
  if (scenario === null) return null
  if (scenario.kind !== 'delivery') return { kind: 'oracle', index: scenario.index, component: scenarioComponent(scenario, plan) }
  const component = /** @type {StoryScenario} */ (scenario.scenario).component
  return { kind: 'delivery', index: scenario.index, component, immutable: immutableFiles(scenario.oracles, components) }
}

/** The component of the scenario, from the plan the pass writes when it writes one. @param {ScenarioPass} scenario @param {ScenarioPlan | null} plan */
const scenarioComponent = (scenario, plan) => (scenario.kind === 'plan' ? plan?.scenarios[0].component ?? null : /** @type {StoryScenario} */ (scenario.scenario).component)

/**
 * The files of the reds committed so far that the green may not change: every one but the
 * skeleton the acceptance tests call, in the source paths.
 * @param {Oracle[]} oracles @param {Component[]} components
 */
const immutableFiles = (oracles, components) => [...new Set(oracles.flatMap((oracle) => acceptanceFiles(oracle, components)))]

/**
 * The files of a red of an acceptance test the green may not change: all but the skeleton.
 * @param {Pick<Oracle, 'files'>} oracle @param {Component[]} components
 */
export const acceptanceFiles = ({ files }, components) => files.filter((file) => !isCode(file, components, ['src']))

/**
 * Replays the scenario's tests at the green the pass committed, when the commit rules let it.
 * @param {import('./commit-replays.mjs').ReplayDeps} deps @param {import('./commit-replays.mjs').ReplayRun} run
 * @param {{ judged: JudgedCommit[], scenario: ScenarioPass | null, components: Component[] }} pass
 * @returns {Promise<string | null>} why the machine could not replay it
 */
export const replayScenarioGreen = (deps, run, { judged, scenario, components }) => {
  const green = judged.find((commit) => commit.kind === 'green' && commit.verdict === 'ok')
  if (scenario?.kind !== 'delivery' || green === undefined) return Promise.resolve(null)
  const component = /** @type {Component} */ (components.find(({ name }) => name === /** @type {StoryScenario} */ (scenario.scenario).component))
  const oracle = /** @type {Oracle} */ (scenario.oracles.find((candidate) => candidate.scenario === scenario.index))
  return replayGreen(deps, run, green, { component, command: oracle.command, red: oracle.sha })
}

/**
 * The pass's own failures: no red of the scenario's acceptance test after an oracle pass, no
 * green after a delivery pass, a commit changing code of a story declared docs only.
 * @param {JudgedCommit[]} judged @param {ScenarioPass | null} scenario
 * @param {{ plan: ScenarioPlan | null, components: Component[] }} context
 * @returns {ScenarioFailure[]}
 */
export const scenarioFailures = (judged, scenario, { plan, components }) => {
  if (scenario === null) return []
  return [...missingCommit(judged, scenario), ...exemptionBreaches(judged, (plan ?? scenario).exemption, components)]
}

/** @param {JudgedCommit[]} judged @param {ScenarioPass} scenario @returns {ScenarioFailure[]} */
const missingCommit = (judged, { kind, index, oracles }) => {
  if (kind === 'delivery') return judged.some((commit) => commit.kind === 'green') ? [] : [{ code: 'tdd', line: `scenario ${index} has no feat or fix commit: make its acceptance test pass, then commit once` }]
  const committed = judged.some((commit) => commit.kind === 'red') || oracles.some((oracle) => oracle.scenario === index)
  return committed ? [] : [{ code: 'tdd', line: `scenario ${index} has no failing acceptance test committed: commit it with the skeleton it calls as one test commit` }]
}

/**
 * A story whose walking skeleton is exempt because it changes only documents or configuration
 * changes no source.
 * @param {JudgedCommit[]} judged @param {string} exemption @param {Component[]} components
 * @returns {ScenarioFailure[]}
 */
const exemptionBreaches = (judged, exemption, components) => (exemption !== 'docs-only' ? [] : judged.flatMap((commit) => commit.files
  .filter((file) => isCode(file, components, ['src']))
  .map((file) => ({ code: /** @type {const} */ ('scenarios'), line: `the story declares its walking skeleton exempt as docs only, and ${commitName(commit)} changes ${file}, source of ${ownersOf(components, [file])[0].name}; remove the exemption and tag S1 @walking-skeleton` }))))

/**
 * What a done pass leaves for the next: the plan it wrote, the red of its scenario (the one it
 * committed, else the one an earlier pass did), the green that made it pass.
 * @param {JudgedCommit[]} judged @param {ScenarioPass | null} scenario
 * @param {{ plan: ScenarioPlan | null, commands: Map<string, 'test' | 'e2e'>, components: Component[] }} context
 * @returns {ScenarioRecord}
 */
export const scenarioRecord = (judged, scenario, { plan, commands, components }) => {
  if (scenario === null) return {}
  if (scenario.kind === 'delivery') return greenRecord(judged, scenario)
  const oracle = newOracle(judged, scenario.index, { commands, components }) ?? scenario.oracles[0]
  return { ...(plan === null ? {} : { scenarios: plan.scenarios, exemption: plan.exemption }), oracle }
}

/**
 * The scenario a done delivery pass made pass: a done pass committed its one green.
 * @param {JudgedCommit[]} judged @param {ScenarioPass} scenario @returns {ScenarioRecord}
 */
const greenRecord = (judged, { index }) => ({ green: { scenario: index } })

/**
 * The red the pass committed for its scenario, with the command whose replay proved it.
 * @param {JudgedCommit[]} judged @param {number} index
 * @param {{ commands: Map<string, 'test' | 'e2e'>, components: Component[] }} context
 * @returns {Oracle | null}
 */
const newOracle = (judged, index, { commands, components }) => {
  const red = judged.find((commit) => commit.kind === 'red')
  if (red === undefined) return null
  const { name } = ownersOf(components, red.files)[0]
  return { scenario: index, sha: red.sha, subject: red.subject, component: name, files: red.files, command: /** @type {'test' | 'e2e'} */ (commands.get(red.sha)) }
}
