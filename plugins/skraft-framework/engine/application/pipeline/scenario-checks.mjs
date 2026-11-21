import { commitName } from '../../domain/pipeline/commits.mjs'
import { isCode, ownersOf } from '../../domain/pipeline/component-files.mjs'
import { readDeliveryGroups, readScenarioPlan } from '../../domain/pipeline/scenarios.mjs'
import { scenarioNodes } from '../../domain/workflow/workflow.mjs'

/**
 * What the engine checks on a pass of a story built from its acceptance tests first: the
 * scenarios the acceptance designer's test plan lists and the groups its implementation plan
 * delivers them in, one red holding the walking skeleton and the acceptance test of every
 * scenario; then, per group, one green that makes the group's scenarios pass without touching
 * those tests and keeps the walking skeleton and the groups before passing; a walking skeleton
 * declared exempt as docs only that no commit contradicts; and what the pass leaves for the next ones.
 *
 * @typedef {import('../../domain/pipeline/scenarios.mjs').ScenarioPlan} ScenarioPlan
 * @typedef {import('../../domain/pipeline/scenarios.mjs').StoryScenario} StoryScenario
 * @typedef {import('../../domain/pipeline/scenarios.mjs').DeliveryGroup} DeliveryGroup
 * @typedef {import('../../domain/journal/run-state.mjs').Oracle} Oracle
 * @typedef {import('../../domain/pipeline/commits.mjs').JudgedCommit} JudgedCommit
 * @typedef {import('../../domain/pipeline/commits.mjs').ScenarioJudging} ScenarioJudging
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {{
 *   kind: 'plan' | 'delivery', index: number, of: number, scenario: StoryScenario | null,
 *   scenarios: StoryScenario[], pending: StoryScenario[],
 *   oracles: Oracle[], skeleton: Oracle | null, exemption: import('../../domain/pipeline/scenarios.mjs').Exemption,
 *   approved: StoryScenario[],
 * }} ScenarioPass
 *   plan: the pass that writes the story's scenarios, its groups and the one red of their
 *   acceptance tests and walking skeleton; delivery: the green of group `index`. of: how many
 *   groups the last plan delivers in (scenarios on the plan's pass); scenario: the first of the
 *   group, whose component the green works in; scenarios: the group's; pending: those of the
 *   groups after it, whose tests still fail at its green; oracles: the red of each scenario;
 *   skeleton: the red of the walking skeleton; exemption: the walking skeleton's, as the last plan
 *   declared it; approved: the scenarios of the last plan.
 * @typedef {{ code: 'scenarios' | 'tdd', line: string }} ScenarioFailure
 * @typedef {{ scenarios?: StoryScenario[], groups?: DeliveryGroup[], exemption?: string, skeleton?: Oracle | null, oracles?: Oracle[], green?: { group: number, others?: string[] } }} ScenarioRecord
 *   what a done pass journals for the passes after it.
 */

/**
 * The scenarios a pass of a node marked each="scenario" works on: the plan and the red of every
 * acceptance test on the first node's pass, group `group` on the delivery node's; null on a pass
 * of the delivery node with none, and on any other node.
 * @param {import('../../domain/workflow/workflow.mjs').Workflow} workflow
 * @param {import('../../domain/journal/run-state.mjs').RunState} run
 * @param {{ node: import('../../domain/workflow/workflow.mjs').WorkflowNode, group: number | null }} next
 * @returns {ScenarioPass | null}
 */
export const scenarioPassOf = (workflow, run, { node, group }) => {
  if (node.each !== 'scenario') return null
  const delivery = node.id !== scenarioNodes(workflow)[0]
  if (delivery && group === null) return null
  const scenarios = run.scenarios ?? NO_SCENARIOS
  return delivery ? deliveryPass(scenarios, /** @type {number} */ (group)) : planPass(scenarios)
}

/** What a run that recorded no scenario yet holds. @type {NonNullable<import('../../domain/journal/run-state.mjs').RunState['scenarios']>} */
const NO_SCENARIOS = Object.freeze({ list: [], exemption: 'none', groups: [], oracles: {}, skeleton: null, delivered: 0 })

/** @param {NonNullable<import('../../domain/journal/run-state.mjs').RunState['scenarios']>} scenarios @returns {ScenarioPass} */
const planPass = ({ list, exemption, oracles, skeleton }) => ({ kind: 'plan', index: 1, of: list.length, scenario: null, scenarios: [], pending: [], oracles: Object.values(oracles), skeleton, exemption, approved: list })

/**
 * @param {NonNullable<import('../../domain/journal/run-state.mjs').RunState['scenarios']>} scenarios @param {number} index
 * @returns {ScenarioPass}
 */
const deliveryPass = ({ list, exemption, groups, oracles, skeleton }, index) => {
  const of = (numbers) => list.filter((scenario) => numbers.includes(scenario.index))
  const scenarios = of(groups[index - 1]?.scenarios ?? [])
  const pending = of(groups.slice(index).flatMap((group) => group.scenarios))
  return { kind: 'delivery', index, of: groups.length, scenario: scenarios[0] ?? null, scenarios, pending, oracles: Object.values(oracles), skeleton, exemption, approved: list }
}

/**
 * The scenario plan of the acceptance designer's test plan and the groups of its implementation
 * plan beside it (`impl-plan-…` for `test-plan-…`), on the pass that writes them; nothing on
 * another pass, or while the test plan is missing.
 * @param {{ files: import('../ports/tracking-files.mjs').TrackingFiles }} deps
 * @param {{ slug: string, components: Component[] }} run
 * @param {{ scenario: ScenarioPass | null, outputs: string[] }} step @param {string[]} missing
 * @returns {Promise<{ plan: (ScenarioPlan & { groups: DeliveryGroup[] }) | null, failures: ScenarioFailure[] }>}
 */
export const planOf = async ({ files }, { slug, components }, { scenario, outputs }, missing) => {
  if (scenario?.kind !== 'plan' || missing.includes(outputs[0])) return NO_PLAN
  const read = readScenarioPlan({ path: outputs[0], text: /** @type {string} */ (await files.read(slug, outputs[0])) }, components)
  if (!read.ok) return { plan: null, failures: read.failures.map((line) => ({ code: 'scenarios', line })) }
  const path = implementationPlanOf(outputs[0])
  const grouped = readDeliveryGroups({ path, text: (await files.read(slug, path)) ?? null }, read.plan.scenarios)
  return grouped.ok ? { plan: { ...read.plan, groups: grouped.groups }, failures: [] } : { plan: null, failures: grouped.failures.map((line) => ({ code: 'scenarios', line })) }
}

/** @type {{ plan: null, failures: ScenarioFailure[] }} */
const NO_PLAN = Object.freeze({ plan: null, failures: [] })

/** The implementation plan the acceptance designer writes beside its test plan. @param {string} testPlan */
const implementationPlanOf = (testPlan) => testPlan.replace(/test-plan-([^/]*)$/, 'impl-plan-$1')

/**
 * What the commit rules need of the scenarios a pass works on.
 * @param {ScenarioPass | null} scenario @param {ScenarioPlan | null} plan @param {Component[]} components
 * @returns {ScenarioJudging | null}
 */
export const scenarioJudging = (scenario, plan, components) => {
  if (scenario === null) return null
  if (scenario.kind === 'plan') return { kind: 'oracle', index: scenario.index, components: plan === null ? null : [...new Set(plan.scenarios.map(({ component }) => component))] }
  const component = /** @type {StoryScenario} */ (scenario.scenario).component
  return { kind: 'delivery', index: scenario.index, component, immutable: immutableFiles(scenario, components) }
}

/**
 * The files of the red the green may not change, the walking skeleton's included: every one but
 * the skeleton of code the tests call, in the source paths.
 * @param {ScenarioPass} scenario @param {Component[]} components
 */
const immutableFiles = ({ oracles, skeleton }, components) => [...new Set([...oracles, ...(skeleton === null ? [] : [skeleton])].flatMap((oracle) => acceptanceFiles(oracle, components)))]

/**
 * The files of a red of an acceptance test the green may not change: all but the skeleton.
 * @param {Pick<Oracle, 'files'>} oracle @param {Component[]} components
 */
export const acceptanceFiles = ({ files }, components) => files.filter((file) => !isCode(file, components, ['src']))

/**
 * The pass's own failures: no red of the acceptance tests after the plan's pass, no green after a
 * delivery pass, a commit changing code of a story declared docs only.
 * @param {JudgedCommit[]} judged @param {ScenarioPass | null} scenario
 * @param {{ plan: ScenarioPlan | null, components: Component[] }} context
 * @returns {ScenarioFailure[]}
 */
export const scenarioFailures = (judged, scenario, { plan, components }) => {
  if (scenario === null) return []
  const exemption = (plan ?? scenario).exemption
  return [...MISSING[scenario.kind](judged, scenario), ...exemptionBreaches(judged, exemption, components)]
}

/** @param {JudgedCommit[]} judged */
const redCommitted = (judged) => judged.some((commit) => commit.kind === 'red')

/**
 * The commit a pass misses, by kind of pass: the plan's, the one red of every scenario's
 * acceptance test, unless an earlier plan's pass committed it; a delivery's, its green.
 * @type {Readonly<Record<ScenarioPass['kind'], (judged: JudgedCommit[], scenario: ScenarioPass) => ScenarioFailure[]>>}
 */
const MISSING = Object.freeze({
  plan: (judged, { oracles }) => (redCommitted(judged) || oracles.length > 0 ? [] : [{ code: 'tdd', line: 'the story has no failing acceptance tests committed: write the acceptance test of every scenario, with the walking skeleton and the skeleton they call, and commit them as one test commit' }]),
  delivery: (judged, { index, scenarios }) => (judged.some((commit) => commit.kind === 'green') ? [] : [{ code: 'tdd', line: `group ${index} (${scenarios.map(({ index: number }) => `S${number}`).join(', ')}) has no feat or fix commit: make its acceptance tests pass, then commit once` }]),
})

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
 * What a done pass leaves for the next: the plan it wrote, its groups and the red of every
 * scenario (the one it committed, else the one an earlier plan's pass did), the same red as the
 * walking skeleton's (none for a story exempt of one); the group a green made pass.
 * @param {JudgedCommit[]} judged @param {ScenarioPass | null} scenario
 * @param {{ plan: (ScenarioPlan & { groups: DeliveryGroup[] }) | null, components: Component[] }} context
 * @returns {ScenarioRecord}
 */
export const scenarioRecord = (judged, scenario, { plan, components }) => {
  if (scenario === null) return {}
  if (scenario.kind === 'delivery') return greenRecord(judged, scenario, components)
  return plan === null ? {} : planRecord(judged, scenario, { plan, components })
}

/**
 * @param {JudgedCommit[]} judged @param {ScenarioPass} scenario
 * @param {{ plan: ScenarioPlan & { groups: DeliveryGroup[] }, components: Component[] }} context
 * @returns {ScenarioRecord}
 */
const planRecord = (judged, scenario, { plan, components }) => {
  const red = newOracle(judged, { components }) ?? scenario.oracles[0] ?? null
  const oracles = red === null ? [] : plan.scenarios.map(({ index }) => ({ ...red, scenario: index }))
  return { scenarios: plan.scenarios, groups: plan.groups, exemption: plan.exemption, skeleton: plan.exemption === 'none' && red !== null ? { ...red, scenario: 1 } : null, oracles }
}

/**
 * The group a done delivery pass made pass, and the other components its one green changed.
 * @param {JudgedCommit[]} judged @param {ScenarioPass} scenario @param {Component[]} components
 * @returns {ScenarioRecord}
 */
const greenRecord = (judged, { index, scenario }, components) => {
  const files = judged.filter((commit) => commit.kind === 'green').flatMap((commit) => commit.files)
  const others = ownersOf(components, files).map(({ name }) => name).filter((name) => name !== /** @type {StoryScenario} */ (scenario).component)
  return { green: others.length === 0 ? { group: index } : { group: index, others } }
}

/**
 * The red the pass committed.
 * @param {JudgedCommit[]} judged
 * @returns {Oracle | null}
 */
const newOracle = (judged, { components }) => {
  const red = judged.find((commit) => commit.kind === 'red')
  if (red === undefined) return null
  const { name } = ownersOf(components, red.files)[0]
  return { scenario: 1, sha: red.sha, subject: red.subject, component: name, files: red.files }
}
