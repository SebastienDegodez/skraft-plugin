import { commitName, namesGroup } from '../../domain/pipeline/commits.mjs'
import { isCode, ownersOf } from '../../domain/pipeline/component-files.mjs'
import { delivers, writesScenarios } from '../../domain/pipeline/roles.mjs'
import { groupLabel, readDeliveryGroups, readScenarioPlan } from '../../domain/pipeline/scenarios.mjs'

/**
 * What the engine checks on a pass of a story built from its acceptance tests first: the
 * scenarios the acceptance designer's test plan lists and the groups its implementation plan
 * delivers them in, one red holding the walking skeleton and the acceptance test of every
 * scenario; then, in one pass, the software engineer's greens, at most one per group, in the
 * plan's order, none touching those tests; a walking skeleton declared exempt as docs only that no
 * commit contradicts; and what the pass leaves for the next ones.
 *
 * @typedef {import('../../domain/pipeline/scenarios.mjs').ScenarioPlan} ScenarioPlan
 * @typedef {import('../../domain/pipeline/scenarios.mjs').StoryScenario} StoryScenario
 * @typedef {import('../../domain/pipeline/scenarios.mjs').DeliveryGroup} DeliveryGroup
 * @typedef {import('../../domain/journal/run-state.mjs').Oracle} Oracle
 * @typedef {import('../../domain/pipeline/commits.mjs').JudgedCommit} JudgedCommit
 * @typedef {import('../../domain/pipeline/commits.mjs').ScenarioJudging} ScenarioJudging
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {{ index: number, scenarios: StoryScenario[], pending: StoryScenario[] }} PassGroup
 * @typedef {{
 *   kind: 'plan' | 'delivery' | 'rework', groups: PassGroup[], oracles: Oracle[], reds: Oracle[],
 *   skeleton: Oracle | null, exemption: import('../../domain/pipeline/scenarios.mjs').Exemption,
 *   approved: StoryScenario[],
 * }} ScenarioPass
 *   plan: the pass that writes the story's scenarios, its groups and the one red of their
 *   acceptance tests and walking skeleton; delivery: the one pass that makes every group not yet
 *   delivered pass, carrying them in the plan's order; rework: a pass after the story is
 *   delivered (the gates or the review sent it back), which changes no acceptance test. groups:
 *   each with its scenarios and those of the groups after it, whose tests still fail at its green;
 *   oracles: the red of each scenario of the last plan; reds: every red of acceptance tests any
 *   plan committed; skeleton: the red of the walking skeleton; exemption: the walking skeleton's,
 *   as the last plan declared it; approved: the scenarios of the last plan.
 * @typedef {{ code: 'scenarios' | 'tdd', line: string }} ScenarioFailure
 * @typedef {{ scenarios?: StoryScenario[], groups?: DeliveryGroup[], exemption?: string, skeleton?: Oracle | null, oracles?: Oracle[], green?: { group: number, others?: string[] } }} ScenarioRecord
 *   what a done pass journals for the passes after it.
 */

/**
 * The scenarios a pass works on: the plan and the one red of every acceptance test on the pass of
 * the node that writes them; every group not yet delivered on the pass of the node that delivers
 * them, or the red it keeps whole once the story is delivered; null on any other node, and on a
 * delivering pass of a run that recorded no plan.
 * @param {import('../../domain/journal/run-state.mjs').RunState} run
 * @param {import('../../domain/workflow/workflow.mjs').WorkflowNode} node
 * @returns {ScenarioPass | null}
 */
export const scenarioPassOf = (run, node) => {
  const scenarios = run.scenarios ?? NO_SCENARIOS
  if (writesScenarios(node)) return planPass(scenarios)
  return delivers(node) ? deliveryPass(scenarios) : null
}

/** What a run that recorded no scenario yet holds. @type {NonNullable<import('../../domain/journal/run-state.mjs').RunState['scenarios']>} */
const NO_SCENARIOS = Object.freeze({ list: [], exemption: 'none', groups: [], oracles: {}, skeleton: null, reds: [], delivered: 0 })

/** @param {NonNullable<import('../../domain/journal/run-state.mjs').RunState['scenarios']>} scenarios @returns {ScenarioPass} */
const planPass = ({ list, exemption, oracles, skeleton, reds }) => ({ kind: 'plan', groups: [], oracles: Object.values(oracles), reds, skeleton, exemption, approved: list })

/**
 * @param {NonNullable<import('../../domain/journal/run-state.mjs').RunState['scenarios']>} scenarios
 * @returns {ScenarioPass | null}
 */
const deliveryPass = ({ list, exemption, groups, oracles, skeleton, reds, delivered }) => {
  const of = (/** @type {number[]} */ numbers) => list.filter((scenario) => numbers.includes(scenario.index))
  const owed = groups.filter(({ index }) => index > delivered).map(({ index, scenarios }) => ({ index, scenarios: of(scenarios), pending: of(groups.slice(index).flatMap((group) => group.scenarios)) }))
  const kind = owed.length > 0 ? 'delivery' : 'rework'
  return kind === 'rework' && reds.length === 0 ? null : { kind, groups: owed, oracles: Object.values(oracles), reds, skeleton, exemption, approved: list }
}

/**
 * The short sha of the green an earlier visit of the node committed for each group, null for a
 * group with none: the pass a human reopened tells them, so the engineer does not commit them again.
 * @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events
 * @param {{ step: string, visit: number }} at @param {string[]} labels the groups' labels, as the subjects of their greens name them
 * @returns {Array<string | null>}
 */
export const committedGreens = (events, { step, visit }, labels) => {
  const greens = events
    .filter((event) => event.type === 'commits.checked' && event.step === step && event.visit < visit)
    .flatMap((event) => event.commits)
    .filter((/** @type {{ kind: string, verdict: string }} */ commit) => commit.kind === 'green' && commit.verdict === 'ok')
  return labels.map((label) => greens.find((/** @type {{ subject: string }} */ commit) => namesGroup(commit.subject, label))?.sha.slice(0, 7) ?? null)
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
  if (scenario.kind === 'plan') return { kind: 'oracle', components: plan === null ? null : [...new Set(plan.scenarios.map(({ component }) => component))] }
  const immutable = immutableFiles(scenario, components)
  if (scenario.kind === 'rework') return { kind: 'rework', immutable }
  return { kind: 'delivery', groups: scenario.groups.map(({ scenarios }) => groupLabel(scenarios.map(({ index }) => index))), immutable }
}

/**
 * The files of every red the greens may not change: the acceptance tests of any plan's red, the
 * skeleton of code the tests call left out, in the source paths.
 * @param {ScenarioPass} scenario @param {Component[]} components
 */
const immutableFiles = ({ reds }, components) => [...new Set(reds.flatMap((red) => acceptanceFiles(red, components)))]

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
 * acceptance test, unless an earlier plan's pass committed it; a delivery's, a green; a rework's,
 * none.
 * @type {Readonly<Record<ScenarioPass['kind'], (judged: JudgedCommit[], scenario: ScenarioPass) => ScenarioFailure[]>>}
 */
const MISSING = Object.freeze({
  plan: (judged, { oracles }) => (redCommitted(judged) || oracles.length > 0 ? [] : [{ code: 'tdd', line: 'the story has no failing acceptance tests committed: write the acceptance test of every scenario, with the walking skeleton and the skeleton they call, and commit them as one test commit' }]),
  delivery: (judged) => (judged.some((commit) => commit.kind === 'green') ? [] : [{ code: 'tdd', line: 'the story has no feat or fix commit: make every group pass, one commit per group whose acceptance tests did not already pass' }]),
  rework: () => [],
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
  if (scenario.kind !== 'plan') return greenRecord(judged, scenario, components)
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
 * The last group a done delivery pass delivered, and the other components its greens changed.
 * @param {JudgedCommit[]} judged @param {ScenarioPass} scenario @param {Component[]} components
 * @returns {ScenarioRecord}
 */
const greenRecord = (judged, { groups }, components) => {
  if (groups.length === 0) return {}
  const files = judged.filter((commit) => commit.kind === 'green').flatMap((commit) => commit.files)
  const own = new Set(groups.flatMap(({ scenarios }) => scenarios).map(({ component }) => component))
  const others = ownersOf(components, files).map(({ name }) => name).filter((name) => !own.has(name))
  const group = /** @type {PassGroup} */ (groups.at(-1)).index
  return { green: others.length === 0 ? { group } : { group, others } }
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
