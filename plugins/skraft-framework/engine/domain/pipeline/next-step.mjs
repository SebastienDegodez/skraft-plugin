import { edgeKey } from '../journal/run-state.mjs'

/**
 * @typedef {import('../workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('../journal/run-state.mjs').RunState} RunState
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('../journal/run-state.mjs').OpenAttempt} OpenAttempt
 * @typedef {{ visit: number, attempt: number, missing: string[], feedback: string[], resumed: OpenAttempt | null }} Entry
 *   missing and feedback: what the previous attempt left missing or got refused for, or for a
 *   new pass the gate failures that sent the run back; resumed: the open attempt a resumed run
 *   picks up.
 * @typedef {Entry & { kind: 'agent' | 'gate', phase: string, node: WorkflowNode }} WorkStep
 * @typedef {{ kind: 'skip', phase: string, node: WorkflowNode, visit: number }} SkipStep
 *   a locked gate the repository's workflow unlocked.
 * @typedef {'agent-blocked' | 'breaker' | 'ceiling' | 'route' | 'workflow-changed'} BlockCause
 * @typedef {{ kind: 'blocked', phase: string | null, node: WorkflowNode | null, cause: BlockCause, last: RunEvent | null, previous: RunEvent | null, missingNode: string | null }} BlockedStep
 * @typedef {{ kind: 'close-phase', phase: string }} ClosePhaseStep
 * @typedef {{ kind: 'done', phase: string | null }} DoneStep
 * @typedef {WorkStep | SkipStep | BlockedStep | ClosePhaseStep | DoneStep} NextStep
 */

/** Attempts an agent node gets per pass when its node sets no max_attempts. */
export const DEFAULT_ATTEMPTS = 3

/**
 * What the run does next, from its workflow and its derived state.
 * @param {Workflow} workflow
 * @param {RunState} run
 * @returns {NextStep}
 */
export const nextStep = (workflow, run) => {
  const open = Object.entries(run.nodes).find(([, state]) => state.open !== null)
  if (open) {
    const [id, { open: attempt }] = /** @type {[string, { open: OpenAttempt }]} */ (open)
    const node = workflow.nodes[id]
    if (!node) return changed(id)
    return enter(node, { visit: attempt.visit, attempt: attempt.attempt, missing: attempt.missing, feedback: attempt.feedback, resumed: attempt }, run)
  }
  const { last } = run
  if (last === null) {
    const first = run.start ?? /** @type {{ to: string }} */ (workflow.edges.find((edge) => edge.from === workflow.start)).to
    return enter(workflow.nodes[first], { visit: 1, attempt: 1, missing: [], feedback: [], resumed: null }, run)
  }
  const node = workflow.nodes[last.step]
  if (!node) return changed(last.step)
  if (last.outcome === 'failed') {
    const { previous } = run.nodes[last.step]
    const block = (/** @type {BlockCause} */ cause) => ({ kind: /** @type {const} */ ('blocked'), phase: node.phase, node, cause, last, previous, missingNode: null })
    if (last.code === 'agent-blocked') return block('agent-blocked')
    if (previous !== null && sameFailure(previous, last)) return block('breaker')
    if (last.attempt >= (node.maxAttempts ?? DEFAULT_ATTEMPTS)) return block('ceiling')
    return enter(node, { visit: last.visit, attempt: last.attempt + 1, missing: last.missing, feedback: last.failures, resumed: null }, run)
  }
  if (last.next === null) return { kind: 'blocked', phase: node.phase, node, cause: 'route', last, previous: null, missingNode: null }
  const target = workflow.nodes[last.next]
  if (!target) return changed(last.next)
  const phase = /** @type {string} */ (node.phase)
  if (!run.closed.includes(phase) && (target.kind === 'exit' || target.phase !== phase)) return { kind: 'close-phase', phase }
  const visit = (run.nodes[target.id]?.visit ?? 0) + 1
  return enter(target, { visit, attempt: 1, missing: [], feedback: last.outcome === 'fail' ? last.failures : [], resumed: null }, run)
}

/**
 * @param {WorkflowNode} node
 * @param {Entry} entry
 * @param {RunState} run
 * @returns {NextStep}
 */
const enter = (node, entry, run) => {
  if (node.kind === 'exit') return { kind: 'done', phase: run.closed.at(-1) ?? null }
  const phase = /** @type {string} */ (node.phase)
  if (node.kind === 'gate' && node.unlock !== null) return { kind: 'skip', phase, node, visit: entry.visit }
  return { kind: /** @type {'agent' | 'gate'} */ (node.kind), phase, node, ...entry }
}

/** @param {string} id @returns {BlockedStep} */
const changed = (id) => ({ kind: 'blocked', phase: null, node: null, cause: 'workflow-changed', last: null, previous: null, missingNode: id })

/** Two attempts of a pass refused for the same reasons. @param {RunEvent} a @param {RunEvent} b */
const sameFailure = (a, b) => JSON.stringify([a.missing, a.failures]) === JSON.stringify([b.missing, b.failures])

/**
 * The edge a node leaves by, unless taking it once more passes its max_visits.
 * @param {Workflow} workflow
 * @param {RunState} run
 * @param {string} from
 * @param {'PASS' | 'FAIL' | null} label null for an agent's single edge
 * @returns {{ ok: true, to: string } | { ok: false, code: 'gates-failed' | 'loop-ceiling', to: string | null, taken: number, maxVisits: number | null }}
 */
export const route = (workflow, run, from, label) => {
  const edge = workflow.edges.find((candidate) => candidate.from === from && candidate.label === label)
  if (!edge) return { ok: false, code: 'gates-failed', to: null, taken: 0, maxVisits: null }
  const taken = run.traversals[edgeKey(from, edge.to)] ?? 0
  if (edge.maxVisits !== null && taken >= edge.maxVisits) return { ok: false, code: 'loop-ceiling', to: edge.to, taken, maxVisits: edge.maxVisits }
  return { ok: true, to: edge.to }
}
