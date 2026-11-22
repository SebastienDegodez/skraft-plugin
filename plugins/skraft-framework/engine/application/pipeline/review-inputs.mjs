import { GATE_NAMES } from '../../domain/evidence/gate-names.mjs'
import { pathUnder } from '../../domain/config/relative-path.mjs'
import { qualityEvidence } from '../../domain/reporting/run-facts.mjs'

/**
 * What a run hands a review: the base of its changes, its story, the documents its agents filled
 * or wrote, and its components with the gates that hold a traced run on them.
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
  components: facts.components.map((component) => ({ ...component, gates: gatesWithRuns(facts.events, component) })),
})

/**
 * The documents the agents of the phase filled or wrote, those of the story and of the other
 * phases, and each agent node that ran with its own, by phase in workflow order; all relative to
 * the tracking folder. A node the workflow dropped since it ran counts for nothing.
 * @param {RunFacts} facts @returns {ReviewDocuments}
 */
const documentsOf = ({ workflow, run, phase, events }) => {
  const nodes = Object.entries(run.nodes).filter(([id]) => id in workflow.nodes)
  const ofPhase = (/** @type {boolean} */ same) => nodes
    .filter(([id]) => (workflow.nodes[id].phase === phase) === same)
    .flatMap(([, state]) => writtenBy(state))
  return {
    outputs: [...new Set([...ofPhase(true), ...redLogsOf(events, workflow, phase)])],
    context: [...new Set([...run.artifacts, ...ofPhase(false)])],
    artifacts: run.artifacts,
    phases: workflow.phases.map((each) => ({ phase: each, steps: writersOf(workflow, run, each) })).filter(({ steps }) => steps.length > 0),
  }
}

/**
 * The output of the designer's traced run of the acceptance tests, labelled `red`, of the nodes of the phase.
 * @param {RunFacts['events']} events @param {Workflow} workflow @param {string} phase @returns {string[]}
 */
const redLogsOf = (events, workflow, phase) => events
  .filter((event) => event.type === 'evidence.checked' && event.red === true && workflow.nodes[event.step]?.phase === phase)
  .map((event) => event.runs[0].log)

/**
 * The agent nodes of a phase that ran, each with the documents it filled or wrote.
 * @param {Workflow} workflow @param {RunState} run @param {string} phase
 */
const writersOf = (workflow, run, phase) => workflow.order
  .filter((id) => workflow.nodes[id].kind === 'agent' && workflow.nodes[id].phase === phase && id in run.nodes)
  .map((id) => ({ step: id, agent: /** @type {string} */ (workflow.nodes[id].agent), documents: writtenBy(run.nodes[id]) }))

/**
 * The gates the delivery holds a traced run of under a component's folder, in gate order.
 * @param {RunFacts['events']} events @param {{ root: string }} component
 */
const gatesWithRuns = (events, { root }) => GATE_NAMES.filter((gate) => qualityEvidence(events).some((fact) => fact.gate === gate && pathUnder(fact.folder, root) !== null))

/** @param {RunState['nodes'][string]} node */
const writtenBy = (node) => [...new Set([...node.outputs, ...node.documents])]

