import { edgeKey } from '../journal/run-state.mjs'
import { acceptedOf, instructionOf, questionSpec } from '../decisions/questions.mjs'
import { scenarioNodes } from '../workflow/workflow.mjs'

/**
 * @typedef {import('../workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('../workflow/workflow.mjs').WorkflowEdge} WorkflowEdge
 * @typedef {import('../journal/run-state.mjs').RunState} RunState
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('../journal/run-state.mjs').OpenAttempt} OpenAttempt
 * @typedef {import('../journal/run-state.mjs').AskedQuestion} AskedQuestion
 * @typedef {import('../journal/run-state.mjs').Group} Group
 * @typedef {{
 *   visit: number, attempt: number, missing: string[], feedback: string[], instruction: string | null,
 *   sentBy: 'gate' | 'review' | 'ask' | 'answer' | null, resumed: OpenAttempt | null,
 *   group: number | null, groups: Group[],
 * }} Entry
 *   missing and feedback: what the previous attempt left missing or got refused for, or for a
 *   new pass the gate failures, review findings, human refusal or human choice that sent the run
 *   on, sentBy naming which; instruction: the instruction a human answered a block with, on the
 *   pass it reopened, null otherwise; resumed: the open attempt a resumed run picks up. groups: the surviving mutants
 *   of a visit the mutation gate opened on a node that takes them by file, or the story's
 *   scenarios on a node marked each="scenario"; group: the one this attempt works on, from 1;
 *   null with no groups.
 * @typedef {Entry & { kind: 'agent' | 'gate' | 'review' | 'ask' | 'publish' | 'call', phase: string, node: WorkflowNode }} WorkStep
 * @typedef {{ kind: 'skip', phase: string, node: WorkflowNode, visit: number, resumed: OpenAttempt | null }} SkipStep
 *   a locked gate the repository's workflow unlocked.
 * @typedef {'agent-blocked' | 'breaker' | 'ceiling' | 'route' | 'workflow-changed'} BlockCause
 * @typedef {{ kind: 'blocked', phase: string | null, node: WorkflowNode | null, cause: BlockCause, last: RunEvent | null, previous: RunEvent | null, missingNode: string | null, reopens: string | null }} BlockedStep
 *   reopens: the node a human's instruction runs again on a new pass: the agent a refusal
 *   blocks, the node a loop at its ceiling leads back to, a review a lens left without a verdict;
 *   null for a block no instruction lifts.
 * @typedef {{ kind: 'close-phase', phase: string }} ClosePhaseStep
 * @typedef {{ kind: 'done', phase: string | null }} DoneStep
 * @typedef {WorkStep | SkipStep | BlockedStep | ClosePhaseStep | DoneStep} NextStep
 */

/**
 * What opened a step's visit, as its step.started journals it: the kind of node that sent the
 * run there and the instruction a human lifted a block with, each only when there is one.
 * @param {Pick<Entry, 'sentBy' | 'instruction'>} entry
 */
export const causeFields = ({ sentBy, instruction }) => ({ ...(sentBy === null ? {} : { sentBy }), ...(instruction === null ? {} : { instruction }) })

/**
 * The first attempt of a pass that nothing sent back: no output missing, no feedback, no
 * instruction, no mutant group; a pass a human opened adds what it was told.
 * @type {Readonly<Omit<Entry, 'visit'>>}
 */
const FRESH = Object.freeze({
  attempt: 1, missing: [], feedback: [], instruction: null, sentBy: null, resumed: null, group: null,
  // Stryker disable next-line ArrayDeclaration: with group null nothing reads groups (label, brief, route and journal all ask group first)
  groups: [],
})

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
  const decided = humanDecision(workflow, run)
  if (decided !== null) return decided
  if (run.last === null) return begin(workflow, run)
  const node = workflow.nodes[run.last.step]
  if (!node) return changed(run.last.step)
  if (run.last.outcome === 'failed') return retry(node, run, run.last)
  return leaveNode(workflow, run, node, run.last)
}

/**
 * A node done goes on with its next group of surviving mutants, within the story's scenarios,
 * or by its edge.
 * @param {Workflow} workflow @param {RunState} run @param {WorkflowNode} node @param {RunEvent} last
 * @returns {NextStep}
 */
const leaveNode = (workflow, run, node, last) => {
  if (node.each === 'survivor-file' && hasNextGroup(run, last)) return nextGroup(node, run, last)
  return scenarioStep(workflow, run, node, last) ?? advance(workflow, run, node, last)
}

/**
 * The story's scenarios run without edges: a red of a scenario's acceptance test hands over to
 * the node that makes it pass, and a scenario made to pass to the red of the next one; null when
 * the node leaves by its edge (the plan, the last scenario, a pass on no scenario).
 * @param {Workflow} workflow @param {RunState} run @param {WorkflowNode} node @param {RunEvent} last
 * @returns {NextStep | null}
 */
const scenarioStep = (workflow, run, node, last) => {
  if (node.each !== 'scenario' || typeof last.group !== 'number') return null
  const [oracle, delivery] = scenarioNodes(workflow)
  if (node.id === oracle) return closesAfterLastRed(run, node, last.group) ?? enterScenario(workflow.nodes[delivery], run, last.group)
  return last.group < run.nodes[node.id].groups.length ? enterScenario(workflow.nodes[oracle], run, last.group + 1) : null
}

/**
 * The phase of the node that writes the reds closes once the red of the last scenario is written,
 * not before: its edge to the first green left it open.
 * @param {RunState} run @param {WorkflowNode} node the node that writes the reds @param {number} group
 * @returns {ClosePhaseStep | null}
 */
const closesAfterLastRed = (run, node, group) => {
  const phase = /** @type {string} */ (node.phase)
  return group === run.nodes[node.id].groups.length && !run.closed.includes(phase) ? { kind: 'close-phase', phase } : null
}

/**
 * Whether reds of the story's scenarios are still to write: the only phase a run leaves while
 * they are is the one of the node that writes them, for the first green, which does not close it.
 * @param {RunState} run
 */
const redsPending = (run) => run.scenarios !== null && Object.keys(run.scenarios.oracles).length < run.scenarios.list.length

/** A first attempt on a scenario, on a visit of its own. @param {WorkflowNode} node @param {RunState} run @param {number} group */
const enterScenario = (node, run, group) => enter(node, { ...FRESH, visit: run.nodes[node.id].visit + 1, group, groups: /** @type {NonNullable<RunState['scenarios']>} */ (run.scenarios).list }, run)

/**
 * A run stopped inside an attempt picks that attempt up again.
 * @param {Workflow} workflow @param {RunState} run @param {[string, { open: OpenAttempt }]} open
 * @returns {NextStep}
 */
const resume = (workflow, run, [id, { open: attempt }]) => {
  const node = workflow.nodes[id]
  if (!node) return changed(id)
  return enter(node, { visit: attempt.visit, attempt: attempt.attempt, missing: attempt.missing, feedback: attempt.feedback, instruction: attempt.instruction, sentBy: attempt.sentBy, resumed: attempt, ...groupOf(run, id, attempt.group) }, run)
}

/**
 * A human's instruction lifts the block: the node runs again on a new pass, with the failures
 * the block left (the findings of a review at its loop ceiling, the refusals of an agent's last
 * attempt) as its feedback, the outputs that attempt left missing, and the instruction apart, so
 * that the agent never works from the instruction alone (#500). It works on
 * the group the blocked step worked on, its scenario or its file of surviving mutants: a node
 * blocks on its own step, and a review blocking at its ceiling works on none.
 * @param {Workflow} workflow @param {RunState} run @param {string} id @param {string} instruction
 * @returns {NextStep}
 */
const reopen = (workflow, run, id, instruction) => {
  const node = workflow.nodes[id]
  if (!node) return changed(id)
  const last = /** @type {RunEvent} */ (run.last)
  return enter(node, { ...FRESH, visit: run.nodes[id].visit + 1, missing: last.missing ?? [], feedback: last.failures, instruction, sentBy: 'ask', ...groupOf(run, id, last.group) }, run)
}

/**
 * What a human's answer to a block decides: an instruction reopens the node, an acceptance goes
 * on past the review; null when no answer decides anything.
 * @param {Workflow} workflow @param {RunState} run
 * @returns {NextStep | null}
 */
const humanDecision = (workflow, run) => {
  const told = instructionOf(run.question)
  if (told !== null) return reopen(workflow, run, /** @type {AskedQuestion} */ (run.question).step, told)
  return acceptedOf(run.question) ? accept(workflow, run, /** @type {RunEvent} */ (run.last)) : null
}

/**
 * A human accepted the findings a review left at its ceiling: the run goes on by the review's
 * APPROVED edge, closing its phase first when that edge leaves it.
 * @param {Workflow} workflow @param {RunState} run @param {RunEvent} last the review's step at its ceiling
 * @returns {NextStep}
 */
const accept = (workflow, run, last) => {
  const review = workflow.nodes[last.step]
  if (!review) return changed(last.step)
  // A valid workflow gives every review one APPROVED edge, to a node it has.
  const target = workflow.nodes[/** @type {WorkflowEdge} */ (edgeOut(workflow, last.step, 'APPROVED')).to]
  const phase = /** @type {string} */ (review.phase)
  if (closes(run, phase, target)) return { kind: 'close-phase', phase }
  return enter(target, { ...FRESH, visit: (run.nodes[target.id]?.visit ?? 0) + 1 }, run)
}

/**
 * A run with nothing recorded yet enters its start node, or the node it was started at.
 * @param {Workflow} workflow @param {RunState} run
 * @returns {NextStep}
 */
const begin = (workflow, run) => {
  const first = run.start ?? /** @type {{ to: string }} */ (workflow.edges.find((edge) => edge.from === workflow.start)).to
  return enter(workflow.nodes[first], { ...FRESH, visit: 1 }, run)
}

/**
 * A refused attempt is tried again with what it was refused for; a refusal that blocks the run
 * asks a human, whose instruction runs the agent again on a new pass.
 * @param {WorkflowNode} node @param {RunState} run @param {RunEvent} last
 * @returns {NextStep}
 */
const retry = (node, run, last) => {
  const { previous } = run.nodes[last.step]
  const cause = refusalBlock(node, previous, last)
  if (cause !== null) return { kind: 'blocked', phase: node.phase, node, cause, last, previous, missingNode: null, reopens: node.id }
  return enter(node, { visit: last.visit, attempt: last.attempt + 1, missing: last.missing, feedback: last.failures, instruction: null, sentBy: run.nodes[last.step].sentBy, resumed: null, ...groupOf(run, last.step, last.group) }, run)
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
  return enter(node, { visit: last.visit, attempt: 1, missing: [], feedback: [], instruction: null, sentBy, resumed: null, group: last.group + 1, groups }, run)
}

/**
 * Why a refused attempt blocks the run: the agent said so, it failed the same way twice, or it
 * used its last attempt; null when it gets another one.
 * @param {WorkflowNode} node @param {RunEvent | null} previous @param {RunEvent} last
 * @returns {BlockCause | null}
 */
const refusalBlock = (node, previous, last) => {
  if (last.code === 'agent-blocked') return 'agent-blocked'
  if (last.code === 'repeated-failure') return 'breaker'
  if (previous !== null && sameFailure(previous, last)) return 'breaker'
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
  if (last.next === null) return { kind: 'blocked', phase: node.phase, node, cause: 'route', last, previous: null, missingNode: null, reopens: reopened(last) }
  const target = workflow.nodes[last.next]
  if (!target) return changed(last.next)
  const phase = /** @type {string} */ (node.phase)
  if (closes(run, phase, target) && !redsPending(run)) return { kind: 'close-phase', phase }
  const visit = (run.nodes[target.id]?.visit ?? 0) + 1
  const groups = firstGroup(workflow, run, target, last)
  // A group of survivors gets its own mutants, not the gates' summary of every file.
  return enter(target, { visit, attempt: 1, missing: [], feedback: groups.group === null ? last.failures : [], instruction: null, sentBy: sentBy(node, last), resumed: null, ...groups }, run)
}

/**
 * A node that takes surviving mutants by file starts its visit on the first file the mutation
 * gate named; the node that makes the story's scenarios pass starts on the first one no green
 * made pass yet, once its red is committed; any other visit has no group.
 * @param {Workflow} workflow @param {RunState} run @param {WorkflowNode} target @param {RunEvent} last what sent the run to it
 * @returns {Pick<Entry, 'group' | 'groups'>}
 */
const firstGroup = (workflow, run, target, last) => {
  if (target.each === 'scenario') return pendingScenario(workflow, run, target)
  const groups = target.each === 'survivor-file' ? last.survivors ?? [] : []
  return { group: groups.length > 0 ? 1 : null, groups }
}

/**
 * The scenario the delivery node goes on with: the next one no green made pass, whose red is
 * committed; none once every scenario passes, or for the node that writes the reds.
 * @param {Workflow} workflow @param {RunState} run @param {WorkflowNode} target
 * @returns {Pick<Entry, 'group' | 'groups'>}
 */
const pendingScenario = (workflow, run, target) => {
  const next = (run.scenarios?.delivered ?? 0) + 1
  const scenarios = /** @type {NonNullable<RunState['scenarios']>} */ (run.scenarios)
  const ready = target.id === scenarioNodes(workflow)[1] && next in scenarios.oracles
  // Stryker disable next-line ArrayDeclaration: with group null nothing reads groups (label, brief, route and journal all ask group first)
  return ready ? { group: next, groups: scenarios.list } : { group: null, groups: [] }
}

/** Who sends the run on with failures, by the kind of node it leaves: a call sends it as the review it runs. */
const SENDERS = Object.freeze({ __proto__: null, gate: 'gate', review: 'review', call: 'review', ask: 'ask' })

/** Who sends the run to its next node with failures. @param {WorkflowNode} node @param {RunEvent} last @returns {Entry['sentBy']} */
const sentBy = (node, last) => {
  if (last.failures.length === 0) return null
  return node.kind === 'ask' && !isRefusal(node, last) ? 'answer' : SENDERS[node.kind] ?? null
}

/** An ask node's answer that refuses the work. @param {WorkflowNode} node @param {RunEvent} last */
const isRefusal = (node, last) => questionSpec(/** @type {import('../decisions/questions.mjs').NodeQuestion} */ (node.question)).refusals.includes(last.answer)

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
 * at its max_visits leads back to, as its step recorded it, a review a lens left without a
 * verdict; null for a block no instruction lifts, and for a ceiling a journal written before it
 * recorded where its edge leads.
 * @param {RunEvent} last
 */
const reopened = (last) => {
  if (last.code === 'loop-ceiling') return last.ceiling ?? null
  return last.outcome === 'blocked' ? last.step : null
}

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
