import { edgeKey } from '../journal/run-state.mjs'
import { WHAT } from './workflow-view.mjs'

/**
 * The workflow graph a pane or a canvas draws: each step of the workflow with where the run
 * stands on it, and each edge with how often the run took it.
 *
 * @typedef {import('../workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('./run-report.mjs').StepReport} StepReport
 * @typedef {{
 *   id: string, kind: string | null, phase: string | null, what: string | null,
 *   state: 'pending' | 'open' | 'done', outcome: string | null,
 *   visits: number, attempts: number, retries: number, durationMs: number, costUsd: number | null,
 * }} GraphNode
 *   kind and what: the workflow's (its agent, gates, lenses, question or publication), null for a
 *   step only the journal names; outcome: what its last attempt recorded, null while one is open.
 * @typedef {{ from: string, to: string, label: string | null, taken: number }} GraphEdge
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[] }} RunGraph
 */

/**
 * The graph of the workflow the run follows; when it cannot be read, the steps the journal
 * names, in the order they first started, with no edge.
 * @param {Workflow | null} workflow @param {StepReport[]} steps @param {Record<string, number>} traversals
 * @returns {RunGraph}
 */
export const runGraph = (workflow, steps, traversals) => (workflow === null ? journalGraph(steps) : workflowGraph(workflow, steps, traversals))

/** @param {Workflow} workflow @param {StepReport[]} steps @param {Record<string, number>} traversals @returns {RunGraph} */
const workflowGraph = (workflow, steps, traversals) => {
  const shown = workflow.order.filter((id) => workflow.nodes[id].kind in WHAT)
  return {
    nodes: shown.map((id) => workflowNode(workflow.nodes[id], steps.find((step) => step.step === id))),
    edges: workflow.edges.filter((edge) => shown.includes(edge.from) && shown.includes(edge.to)).map(({ from, to, label }) => ({ from, to, label, taken: traversals[edgeKey(from, to)] ?? 0 })),
  }
}

/** @param {WorkflowNode} node @param {StepReport | undefined} step @returns {GraphNode} */
const workflowNode = (node, step) => ({ id: node.id, kind: node.kind, phase: node.phase, what: WHAT[node.kind](node), ...progressOf(step) })

/** @param {StepReport[]} steps @returns {RunGraph} */
const journalGraph = (steps) => ({ nodes: steps.map((step) => ({ id: step.step, kind: null, phase: step.phase, what: null, ...progressOf(step) })), edges: [] })

/** Where the run stands on a step: never started, an attempt open, or done. @param {StepReport | undefined} step */
const progressOf = (step) => {
  if (step === undefined) return { state: /** @type {const} */ ('pending'), outcome: null, visits: 0, attempts: 0, retries: 0, durationMs: 0, costUsd: null }
  const { outcome, visits, attempts, retries, durationMs, costUsd } = step
  return { state: outcome === null ? /** @type {const} */ ('open') : /** @type {const} */ ('done'), outcome, visits, attempts, retries, durationMs, costUsd }
}
