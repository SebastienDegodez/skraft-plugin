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
 * @param {RunFacts} facts
 * @returns {Required<ReviewInputs>}
 */
export const runInputs = (facts) => ({
  base: facts.run.base,
  story: facts.run.story,
  documents: documentsOf(facts),
  components: facts.components.map((component) => ({ ...component, gates: passedGates(facts.events, component.name) })),
})

/**
 * The documents the agents of the phase filled or wrote, those of the story and of the other
 * phases, and each agent node that ran with its own, by phase in workflow order; all relative to
 * the tracking folder.
 * @param {RunFacts} facts @returns {ReviewDocuments}
 */
const documentsOf = ({ workflow, run, phase }) => {
  const nodes = Object.entries(run.nodes)
  const ofPhase = (/** @type {boolean} */ same) => nodes
    .filter(([id]) => (workflow.nodes[id]?.phase === phase) === same)
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
 * The gates whose last run on a component in this run passed, in gate order.
 * @param {RunFacts['events']} events @param {string} component
 */
const passedGates = (events, component) => GATE_ORDER.filter((gate) => events.findLast((event) => event.type === 'gate.ran' && event.component === component && event.gate === gate)?.status === 'pass')
