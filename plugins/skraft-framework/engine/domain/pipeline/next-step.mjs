import { edgeKey } from '../journal/run-state.mjs'
import { instructionOf } from '../decisions/questions.mjs'

/**
 * @typedef {import('../workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('../journal/run-state.mjs').RunState} RunState
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('../journal/run-state.mjs').OpenAttempt} OpenAttempt
 * @typedef {import('../journal/run-state.mjs').AskedQuestion} AskedQuestion
 * @typedef {import('../gates/mutation-report.mjs').SurvivorGroup} SurvivorGroup
 * @typedef {{
 *   visit: number, attempt: number, missing: string[], feedback: string[],
 *   sentBy: 'gate' | 'review' | 'ask' | null, resumed: OpenAttempt | null,
 *   group: number | null, groups: SurvivorGroup[],
 * }} Entry
 *   missing and feedback: what the previous attempt left missing or got refused for, or for a
 *   new pass the gate failures, review findings or human refusal that sent the run back, sentBy
 *   naming which; resumed: the open attempt a resumed run picks up. groups: the surviving mutants
 *   of a visit the mutation gate opened on a node that takes them by file; group: the one this
 *   attempt works on, from 1; null with no groups.
 * @typedef {Entry & { kind: 'agent' | 'gate' | 'review' | 'ask' | 'publish' | 'call', phase: string, node: WorkflowNode }} WorkStep
 * @typedef {{ kind: 'skip', phase: string, node: WorkflowNode, visit: number, resumed: OpenAttempt | null }} SkipStep
 *   a locked gate the repository's workflow unlocked.
 * @typedef {'agent-blocked' | 'breaker' | 'ceiling' | 'route' | 'workflow-changed'} BlockCause
 * @typedef {{ kind: 'blocked', phase: string | null, node: WorkflowNode | null, cause: BlockCause, last: RunEvent | null, previous: RunEvent | null, missingNode: string | null, reopens: string | null }} BlockedStep
 *   reopens: the node a human's instruction runs again on a new pass; null for a block no
 *   instruction lifts.
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
  const told = instructionOf(run.question)
  if (told !== null) return reopen(workflow, run, /** @type {AskedQuestion} */ (run.question).step, told)
  if (run.last === null) return begin(workflow, run)
  const node = workflow.nodes[run.last.step]
  if (!node) return changed(run.last.step)
  if (run.last.outcome === 'failed') return retry(node, run, run.last)
  if (hasNextGroup(run, run.last)) return nextGroup(node, run, run.last)
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
  return enter(node, { visit: attempt.visit, attempt: attempt.attempt, missing: attempt.missing, feedback: attempt.feedback, sentBy: attempt.sentBy, resumed: attempt, ...groupOf(run, id, attempt.group) }, run)
}

/**
 * A human's instruction lifts the block: the node runs again on a new pass, with it.
 * @param {Workflow} workflow @param {RunState} run @param {string} id @param {string} instruction
 * @returns {NextStep}
 */
const reopen = (workflow, run, id, instruction) => {
  const node = workflow.nodes[id]
  if (!node) return changed(id)
  return enter(node, { visit: run.nodes[id].visit + 1, attempt: 1, missing: [], feedback: [instruction], sentBy: 'ask', resumed: null, group: null, groups: [] }, run)
}

/**
 * A run with nothing recorded yet enters its start node, or the node it was started at.
 * @param {Workflow} workflow @param {RunState} run
 * @returns {NextStep}
 */
const begin = (workflow, run) => {
  const first = run.start ?? /** @type {{ to: string }} */ (workflow.edges.find((edge) => edge.from === workflow.start)).to
  return enter(workflow.nodes[first], { visit: 1, attempt: 1, missing: [], feedback: [], sentBy: null, resumed: null, group: null, groups: [] }, run)
}

/**
 * A refused attempt is tried again with what it was refused for, unless the run is blocked.
 * @param {WorkflowNode} node @param {RunState} run @param {RunEvent} last
 * @returns {NextStep}
 */
const retry = (node, run, last) => {
  const { previous } = run.nodes[last.step]
  const cause = refusalBlock(node, previous, last)
  // The agent that says it is blocked runs again on a human's instruction; a breaker or a ceiling is no question to a human.
  if (cause !== null) return { kind: 'blocked', phase: node.phase, node, cause, last, previous, missingNode: null, reopens: cause === 'agent-blocked' ? node.id : null }
  return enter(node, { visit: last.visit, attempt: last.attempt + 1, missing: last.missing, feedback: last.failures, sentBy: run.nodes[last.step].sentBy, resumed: null, ...groupOf(run, last.step, last.group) }, run)
}

/** @param {RunState} run @param {string} id @param {number | null | undefined} group @returns {Pick<Entry, 'group' | 'groups'>} */
const groupOf = (run, id, group) => ({ group: group ?? null, groups: run.nodes[id].groups })

/** A group of surviving mutants done while the visit has more. @param {RunState} run @param {RunEvent} last */
const hasNextGroup = (run, last) => typeof last.group === 'number' && last.group < run.nodes[last.step].groups.length

/**
 * The visit goes on with its next group of surviving mutants, on a first attempt.
 * @param {WorkflowNode} node @param {RunState} run @param {RunEvent} last
 * @returns {NextStep}
 */
const nextGroup = (node, run, last) => {
  const { sentBy, groups } = run.nodes[last.step]
  return enter(node, { visit: last.visit, attempt: 1, missing: [], feedback: [], sentBy, resumed: null, group: last.group + 1, groups }, run)
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
  if (last.next === null) return { kind: 'blocked', phase: node.phase, node, cause: 'route', last, previous: null, missingNode: null, reopens: reopened(workflow, run, last) }
  const target = workflow.nodes[last.next]
  if (!target) return changed(last.next)
  const phase = /** @type {string} */ (node.phase)
  if (closes(run, phase, target)) return { kind: 'close-phase', phase }
  const visit = (run.nodes[target.id]?.visit ?? 0) + 1
  const groups = firstGroup(target, last)
  // A group of survivors gets its own mutants, not the gates' summary of every file.
  return enter(target, { visit, attempt: 1, missing: [], feedback: groups.group === null ? last.failures : [], sentBy: sentBy(node, last), resumed: null, ...groups }, run)
}

/**
 * A node that takes surviving mutants by file starts its visit on the first file the mutation
 * gate named; any other visit has no group.
 * @param {WorkflowNode} target @param {RunEvent} last what sent the run to it
 * @returns {Pick<Entry, 'group' | 'groups'>}
 */
const firstGroup = (target, last) => {
  const groups = target.each === 'survivor-file' ? last.survivors ?? [] : []
  return { group: groups.length > 0 ? 1 : null, groups }
}

/** Who sends the run on with failures, by the kind of node it leaves: a call sends it as the review it runs. */
const SENDERS = Object.freeze({ __proto__: null, gate: 'gate', review: 'review', call: 'review', ask: 'ask' })

/** Who sends the run to its next node with failures. @param {WorkflowNode} node @param {RunEvent} last @returns {Entry['sentBy']} */
const sentBy = (node, last) => (last.failures.length > 0 ? SENDERS[node.kind] ?? null : null)

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
  return { kind: /** @type {WorkStep['kind']} */ (node.kind), phase, node, ...entry }
}

/** @param {string} id @returns {BlockedStep} */
const changed = (id) => ({ kind: 'blocked', phase: null, node: null, cause: 'workflow-changed', last: null, previous: null, missingNode: id, reopens: null })

/**
 * The node a human's instruction runs again when no edge leads on from a node: the one a loop
 * at its max_visits leads back to; null for a block no instruction lifts.
 * @param {Workflow} workflow @param {RunState} run @param {RunEvent} last
 */
const reopened = (workflow, run, last) => (last.code === 'loop-ceiling' ? cappedTarget(workflow, run, last.step) : null)

/**
 * Where the edge out of a node that used up its max_visits leads.
 * @param {Workflow} workflow @param {RunState} run @param {string} from
 */
const cappedTarget = (workflow, run, from) =>
  /** @type {import('../workflow/workflow.mjs').WorkflowEdge} */ (workflow.edges.find((edge) => edge.from === from && edge.maxVisits !== null && run.traversals[edgeKey(from, edge.to)] >= edge.maxVisits)).to

/** Two attempts of a pass refused for the same reasons. @param {RunEvent} a @param {RunEvent} b */
const sameFailure = (a, b) => JSON.stringify([a.missing, a.failures]) === JSON.stringify([b.missing, b.failures])

/**
 * The edge leaving the node with that label; for an ask node, the unlabeled one when no edge has the answer.
 * @param {Workflow} workflow @param {string} from @param {string | null} label
 */
const edgeOut = (workflow, from, label) => {
  const edges = workflow.edges.filter((candidate) => candidate.from === from)
  return edges.find((candidate) => candidate.label === label) ?? (workflow.nodes[from]?.kind === 'ask' ? edges.find((candidate) => candidate.label === null) : undefined)
}

/**
 * The edge a node leaves by, unless taking it once more passes its max_visits.
 * @param {Workflow} workflow
 * @param {RunState} run
 * @param {string} from
 * @param {string | null} label null for an agent's single edge; the verdict for a review; an answer for an ask node
 * @returns {{ ok: true, to: string } | { ok: false, code: 'gates-failed' | 'review-rejected' | 'loop-ceiling', to: string | null, taken: number, maxVisits: number | null }}
 */
export const route = (workflow, run, from, label) => {
  const edge = edgeOut(workflow, from, label)
  if (!edge) return { ok: false, code: label === 'NEEDS_REWORK' ? 'review-rejected' : 'gates-failed', to: null, taken: 0, maxVisits: null }

  const taken = run.traversals[edgeKey(from, edge.to)] ?? 0
  if (edge.maxVisits !== null && taken >= edge.maxVisits) return { ok: false, code: 'loop-ceiling', to: edge.to, taken, maxVisits: edge.maxVisits }
  return { ok: true, to: edge.to }
}
