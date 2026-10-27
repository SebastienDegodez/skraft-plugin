import { GATE_ORDER } from '../../domain/gates/gate-plan.mjs'

/**
 * What a run hands a review: the base of its changes, its story, the documents its agents filled
 * or wrote, and its components with the gates that passed on them.
 *
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../review/review-runs.mjs').ReviewInputs} ReviewInputs
 * @typedef {import('../review/review-runs.mjs').ReviewDocuments} ReviewDocuments
 * @typedef {{
 *   workflow: Workflow, run: RunState, phase: string,
 *   components: import('../../domain/config/skraft-config.mjs').Component[],
 *   events: import('../../domain/journal/run-state.mjs').RunEvent[],
 * }} RunFacts
 *   phase: the phase under review; events: the run's journal.
 */

/**
 * What the run hands the review a node runs: everything to a review of its own workflow, to a
 * call only the values its inputs are bound to.
 * @param {import('../../domain/workflow/workflow.mjs').WorkflowNode} node @param {RunFacts} facts
 * @returns {ReviewInputs}
 */
export const boundInputs = ({ call }, facts) => {
  const all = runInputs(facts)
  if (call === null) return all
  const bound = Object.values(call.inputs)
  return /** @type {ReviewInputs} */ (Object.fromEntries(Object.entries(all).filter(([value]) => bound.includes(value))))
}

/**
 * @param {RunFacts} facts
 * @returns {Required<ReviewInputs>}
 */
const runInputs = (facts) => ({
  base: facts.run.base,
  story: facts.run.story,
  documents: documentsOf(facts),
  components: facts.components.map((component) => ({ ...component, gates: passedGates(facts.events, component.name) })),
})

/**
 * The documents the agents of the phase filled or wrote, those of the story and of the other
 * phases, and each agent node that ran with its own, by phase in workflow order; all relative to
 * the tracking folder. A node the workflow dropped since it ran counts for nothing.
 * @param {RunFacts} facts @returns {ReviewDocuments}
 */
const documentsOf = ({ workflow, run, phase }) => {
  const nodes = Object.entries(run.nodes).filter(([id]) => id in workflow.nodes)
  const ofPhase = (/** @type {boolean} */ same) => nodes
    .filter(([id]) => (workflow.nodes[id].phase === phase) === same)
    .flatMap(([, state]) => writtenBy(state))
  return {
    outputs: [...new Set(ofPhase(true))],
    context: [...new Set([...run.artifacts, ...ofPhase(false)])],
    artifacts: run.artifacts,
    phases: workflow.phases.map((each) => ({ phase: each, steps: writersOf(workflow, run, each) })).filter(({ steps }) => steps.length > 0),
  }
}

/**
 * The agent nodes of a phase that ran, each with the documents it filled or wrote.
 * @param {Workflow} workflow @param {RunState} run @param {string} phase
 */
const writersOf = (workflow, run, phase) => workflow.order
  .filter((id) => workflow.nodes[id].kind === 'agent' && workflow.nodes[id].phase === phase && id in run.nodes)
  .map((id) => ({ step: id, agent: /** @type {string} */ (workflow.nodes[id].agent), documents: writtenBy(run.nodes[id]) }))

/** @param {RunState['nodes'][string]} node */
const writtenBy = (node) => [...new Set([...node.outputs, ...node.documents])]

/**
 * The gates whose last run on a component in this run passed, in gate order; only gate.ran
 * events name a component and a gate.
 * @param {RunFacts['events']} events @param {string} component
 */
const passedGates = (events, component) => GATE_ORDER.filter((gate) => events.findLast((event) => event.component === component && event.gate === gate)?.status === 'pass')
