import { edgeKey } from '../journal/run-state.mjs'

/**
 * A workflow as a page draws it, step by step in the order a run meets them: what each step
 * runs, asks or publishes, the lenses of a review with when each runs, the workflow a step
 * calls; each edge with its label, its max_visits and how often the run took it; and, for the
 * workflow a run follows, where the run stands on each step. Start and exit are no steps.
 *
 * @typedef {import('../workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('../journal/run-state.mjs').RunState} RunState
 * @typedef {{
 *   id: string, kind: string, phase: string | null, agent: string | null, gates: string[], question: string | null,
 *   publish: string | null, calls: string | null, lenses: Array<{ lens: string, when: string | null }>,
 *   mandatory: boolean, locked: boolean, state: 'pending' | 'open' | 'done', visits: number,
 * }} DrawnStep
 * @typedef {{ from: string, to: string, label: string | null, maxVisits: number | null, taken: number }} DrawnEdge
 * @typedef {{ name: string, file: string | null, goal: string | null, steps: DrawnStep[], edges: DrawnEdge[] }} WorkflowDrawing
 *   file: the working copy's copy it was read from, null for the plugin's.
 */

const NO_STEPS = Object.freeze(['start', 'exit'])

/**
 * @param {{ name: string, file: string | null, workflow: Workflow, run: RunState | null }} drawn
 *   run: the run that follows it, null for a workflow no run follows
 * @returns {WorkflowDrawing}
 */
export const workflowDrawing = ({ name, file, workflow, run }) => ({
  name,
  file,
  goal: workflow.goal,
  steps: workflow.order.filter((id) => !NO_STEPS.includes(workflow.nodes[id].kind)).map((id) => drawnStep(workflow.nodes[id], run)),
  edges: workflow.edges.map(({ from, to, label, maxVisits }) => ({ from, to, label, maxVisits, taken: run?.traversals[edgeKey(from, to)] ?? 0 })),
})

/** @param {WorkflowNode} node @param {RunState | null} run @returns {DrawnStep} */
const drawnStep = (node, run) => ({
  id: node.id, kind: node.kind, phase: node.phase, agent: node.agent, gates: node.gates, question: node.question,
  publish: node.publish, calls: node.call?.workflow ?? null, lenses: lensesOf(node),
  mandatory: node.mandatory === true, locked: node.locked, ...stateOf(run?.nodes[node.id]),
})

/** A review's lenses, each with when it runs; a call's, folded from the workflow it calls. @param {WorkflowNode} node */
const lensesOf = (node) => (node.branches.length > 0
  ? node.branches.map(({ lens, when }) => ({ lens, when }))
  : node.lenses.map((lens) => ({ lens, when: null })))

/** @param {import('../journal/run-state.mjs').NodeState | undefined} state */
const stateOf = (state) => {
  if (state === undefined) return { state: /** @type {const} */ ('pending'), visits: 0 }
  return { state: state.open === null ? /** @type {const} */ ('done') : /** @type {const} */ ('open'), visits: state.visit }
}
