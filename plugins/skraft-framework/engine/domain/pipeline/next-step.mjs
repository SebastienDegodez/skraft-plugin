import { edgeKey } from '../journal/run-state.mjs'

/**
 * @typedef {import('../workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('../journal/run-state.mjs').RunState} RunState
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('../journal/run-state.mjs').OpenAttempt} OpenAttempt
 * @typedef {{
 *   visit: number, attempt: number, missing: string[], feedback: string[],
 *   sentBy: 'gate' | 'review' | null, resumed: OpenAttempt | null,
 * }} Entry
 *   missing and feedback: what the previous attempt left missing or got refused for, or for a
 *   new pass the gate failures or review findings that sent the run back, sentBy naming which;
 *   resumed: the open attempt a resumed run picks up.
 * @typedef {Entry & { kind: 'agent' | 'gate' | 'review', phase: string, node: WorkflowNode }} WorkStep
 * @typedef {{ kind: 'skip', phase: string, node: WorkflowNode, visit: number, resumed: OpenAttempt | null }} SkipStep
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
  if (open) return resume(workflow, run, /** @type {[string, { open: OpenAttempt }]} */ (open))
  if (run.last === null) return begin(workflow, run)
  const node = workflow.nodes[run.last.step]
  if (!node) return changed(run.last.step)
  if (run.last.outcome === 'failed') return retry(node, run, run.last)
  return advance(workflow, run, node, run.last)
}

/**
 * A run stopped inside an attempt picks that attempt up again.
 * @param {Workflow} workflow @param {RunState} run @param {[string, { open: OpenAttempt }]} open
 * @returns {NextStep}
 */
const resume = (workflow, run, [id, { open: attempt }]) => {
  const node = workflow.nodes[id]
  if (!node) return changed(id)
  return enter(node, { visit: attempt.visit, attempt: attempt.attempt, missing: attempt.missing, feedback: attempt.feedback, sentBy: attempt.sentBy, resumed: attempt }, run)
}

/**
 * A run with nothing recorded yet enters its start node, or the node it was started at.
 * @param {Workflow} workflow @param {RunState} run
 * @returns {NextStep}
 */
const begin = (workflow, run) => {
  const first = run.start ?? /** @type {{ to: string }} */ (workflow.edges.find((edge) => edge.from === workflow.start)).to
  return enter(workflow.nodes[first], { visit: 1, attempt: 1, missing: [], feedback: [], sentBy: null, resumed: null }, run)
}

/**
 * A refused attempt is tried again with what it was refused for, unless the run is blocked.
 * @param {WorkflowNode} node @param {RunState} run @param {RunEvent} last
 * @returns {NextStep}
 */
const retry = (node, run, last) => {
  const { previous } = run.nodes[last.step]
  const cause = refusalBlock(node, previous, last)
  if (cause !== null) return { kind: 'blocked', phase: node.phase, node, cause, last, previous, missingNode: null }
  return enter(node, { visit: last.visit, attempt: last.attempt + 1, missing: last.missing, feedback: last.failures, sentBy: null, resumed: null }, run)
}

/**
 * Why a refused attempt blocks the run: the agent said so, it failed the same way twice, or it
 * used its last attempt; null when it gets another one.
 * @param {WorkflowNode} node @param {RunEvent | null} previous @param {RunEvent} last
 * @returns {BlockCause | null}
 */
const refusalBlock = (node, previous, last) => {
  if (last.code === 'agent-blocked') return 'agent-blocked'
  if (previous !== null && sameFailure(previous, last)) return 'breaker'
  // Stryker disable next-line StringLiteral: a refusal that is not the breaker's is told as the ceiling, whatever its cause
  if (last.attempt >= (node.maxAttempts ?? DEFAULT_ATTEMPTS)) return 'ceiling'
  return null
}

/**
 * A node that passed hands over to the node its edge leads to, closing its phase first when
 * that edge leaves the phase.
 * @param {Workflow} workflow @param {RunState} run @param {WorkflowNode} node @param {RunEvent} last
 * @returns {NextStep}
 */
const advance = (workflow, run, node, last) => {
  if (last.next === null) return { kind: 'blocked', phase: node.phase, node, cause: 'route', last, previous: null, missingNode: null }
  const target = workflow.nodes[last.next]
  if (!target) return changed(last.next)
  const phase = /** @type {string} */ (node.phase)
  if (closes(run, phase, target)) return { kind: 'close-phase', phase }
  const visit = (run.nodes[target.id]?.visit ?? 0) + 1
  return enter(target, { visit, attempt: 1, missing: [], feedback: last.failures, sentBy: sentBy(node, last), resumed: null }, run)
}

/** The kind of node whose failures send the run to its next node. @param {WorkflowNode} node @param {RunEvent} last */
const sentBy = (node, last) => (last.failures.length > 0 && (node.kind === 'gate' || node.kind === 'review') ? node.kind : null)

/**
 * Whether moving to target ends a phase not closed yet.
 * @param {RunState} run @param {string} phase @param {WorkflowNode} target
 */
const closes = (run, phase, target) => !run.closed.includes(phase) && (target.kind === 'exit' || target.phase !== phase)

/**
 * @param {WorkflowNode} node
 * @param {Entry} entry
 * @param {RunState} run
 * @returns {NextStep}
 */
const enter = (node, entry, run) => {
  if (node.kind === 'exit') return { kind: 'done', phase: run.closed.at(-1) ?? null }
  const phase = /** @type {string} */ (node.phase)
  if (node.unlock !== null) return { kind: 'skip', phase, node, visit: entry.visit, resumed: entry.resumed }
  return { kind: /** @type {'agent' | 'gate' | 'review'} */ (node.kind), phase, node, ...entry }
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
 * @param {import('../workflow/workflow.mjs').EdgeLabel | null} label null for an agent's single edge
 * @returns {{ ok: true, to: string } | { ok: false, code: 'gates-failed' | 'review-rejected' | 'loop-ceiling', to: string | null, taken: number, maxVisits: number | null }}
 */
export const route = (workflow, run, from, label) => {
  const edge = workflow.edges.find((candidate) => candidate.from === from && candidate.label === label)
  if (!edge) return { ok: false, code: label === 'NEEDS_REWORK' ? 'review-rejected' : 'gates-failed', to: null, taken: 0, maxVisits: null }
  const taken = run.traversals[edgeKey(from, edge.to)] ?? 0
  if (edge.maxVisits !== null && taken >= edge.maxVisits) return { ok: false, code: 'loop-ceiling', to: edge.to, taken, maxVisits: edge.maxVisits }
  return { ok: true, to: edge.to }
}
