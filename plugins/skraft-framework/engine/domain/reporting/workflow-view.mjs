import { statusLine } from './run-status.mjs'

/**
 * WORKFLOW.md: the workflow a run follows, phase by phase, each step marked done `[x]`, in
 * progress `[>]` or to come `[ ]`; what a host with no pane (the VS Code fallback) reads.
 *
 * @typedef {import('../workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('../journal/run-state.mjs').RunState} RunState
 * @typedef {import('../journal/run-state.mjs').NodeState} NodeState
 */

export const WORKFLOW_FILE = 'WORKFLOW.md'

/** @param {{ slug: string, workflow: Workflow, run: RunState }} view */
export const renderWorkflowView = ({ slug, workflow, run }) => [
  '<!-- markdownlint-disable-file -->',
  `# Workflow — ${slug}`,
  '',
  statusLine(run),
  '',
  ...workflow.phases.flatMap((phase) => phaseLines(workflow, run, phase)),
].join('\n')

/** @param {Workflow} workflow @param {RunState} run @param {string} phase */
const phaseLines = (workflow, run, phase) => [
  `## ${phase}`,
  '',
  ...workflow.order.filter((id) => workflow.nodes[id]?.phase === phase && workflow.nodes[id].kind in WHAT).map((id) => nodeLine(workflow.nodes[id], run.nodes[id])),
  '',
]

/** @param {WorkflowNode} node @param {NodeState | undefined} state */
const nodeLine = (node, state) => `- [${markOf(state)}] ${node.id} — ${WHAT[node.kind](node)}${progressOf(state)}`

/** @param {NodeState | undefined} state */
const markOf = (state) => {
  if (state?.open) return '>'
  return state?.last ? 'x' : ' '
}

/** What a step is, by its kind. @type {Readonly<Record<string, (node: WorkflowNode) => string>>} */
const WHAT = Object.freeze({
  __proto__: null,
  agent: (node) => /** @type {string} */ (node.agent),
  gate: (node) => node.gates.join(', '),
  review: (node) => node.lenses.join(', '),
  ask: (node) => /** @type {string} */ (node.question),
  publish: (node) => `publish ${node.publish}`,
})

/** @param {NodeState | undefined} state */
const progressOf = (state) => {
  if (state === undefined || (state.open === null && state.last === null)) return ''
  const pass = state.visit > 1 ? `, pass ${state.visit}` : ''
  return `: ${state.open ? 'in progress' : /** @type {{ outcome: string }} */ (state.last).outcome}${pass}`
}
