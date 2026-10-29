import { ADOPTED } from './signature.mjs'
import { instructionOf } from '../decisions/questions.mjs'
/**
 * @typedef {{ type: string, at: string, prev: string | null, [field: string]: any }} RunEvent
 * @typedef {{ repository: string, sha: string, dirty: Array<{ path: string, hash: string | null }> }} Head
 *   the HEAD of one repository when an attempt started, and the files then already changed
 *   (relative to the working copy), with the hash of their content (null: deleted).
 * @typedef {{
 *   visit: number, attempt: number, phase: string, agent: string | null, gates: string[] | null,
 *   question: string | null, outputs: string[], missing: string[], feedback: string[], sentBy: 'gate' | 'review' | 'ask' | null, heads: Head[],
 *   group: number | null,
 * }} OpenAttempt
 *   sentBy: the kind of node whose failures or refusal opened this visit, null otherwise; group:
 *   which of the visit's groups of surviving mutants the attempt works on, from 1.
 * @typedef {{
 *   visit: number, attempt: number, outputs: string[], documents: string[], heads: Head[],
 *   sentBy: 'gate' | 'review' | 'ask' | null, redByGateFailure: boolean,
 *   groups: import('../gates/mutation-report.mjs').SurvivorGroup[],
 *   open: OpenAttempt | null, last: RunEvent | null, previous: RunEvent | null,
 * }} NodeState
 *   visit: how many times the run entered the node; attempt: within that visit. outputs: the
 *   paths of the node's first dispatch, which every later one reuses. documents: every document of
 *   the tracking folder the node's attempts wrote, outputs included. heads: the first
 *   attempt's of this visit. sentBy: what sent the run back into this visit, kept for each of
 *   its attempts. redByGateFailure: this visit started on gate failures, which stand for its red
 *   commit; a visit the review or a human refusal opened has no failing test, so its agent
 *   commits a red one. groups: the surviving mutants this visit works on, one dispatch per file.
 *   last and previous: this visit's last two step.recorded.
 * @typedef {{
 *   key: string, kind: import('../decisions/questions.mjs').QuestionKind, step: string, visit: number,
 *   text: string, options: string[], refusals: string[], header: string, subjects: string[],
 *   answer: string | null, reason: string | null,
 * }} AskedQuestion
 *   step: the node it is about (an ask node, or the node the machine could not run); subjects:
 *   what it asks about (the ADRs to ratify).
 * @typedef {{
 *   story: { issue?: number | null, title?: string | null } | null,
 *   base: Array<{ component: string | null, root: string, repository: string, ref: string, source: 'flag' | 'component' | 'config' | 'default', sha: string }>,
 *   artifacts: string[],
 *   start: string | null,
 *   closed: string[],
 *   nodes: Record<string, NodeState>,
 *   last: RunEvent | null,
 *   traversals: Record<string, number>,
 *   phaseStarted: Record<string, string>,
 *   replayMs: Record<string, number>,
 *   replayWarned: string[],
 *   finished: RunEvent | null,
 *   stopped: RunEvent | null,
 *   attempts: number,
 *   costUsd: number | null,
 *   questions: Record<string, AskedQuestion>,
 *   question: AskedQuestion | null,
 * }} RunState
 *   last: the run's last step.recorded; traversals: how often each edge `from->to` was taken;
 *   phaseStarted: when the first step of each phase started; replayMs: time spent replaying
 *   red commits, per phase. questions: by key; question: the last one asked whose answer is not
 *   acted on yet (a step recorded after it, or a RETRY, acts on it).
 */

/** @param {string} from @param {string} to */
export const edgeKey = (from, to) => `${from}->${to}`

/**
 * The state of a run, derived from its events: nothing else is stored.
 * @param {RunEvent[]} events a journal Init started: its first event is `run.started`
 * @returns {RunState}
 */
export const deriveRun = ([started, ...events]) => {
  const run = initialRun(started)
  for (const event of events) apply(run, event)
  return run
}

/** @param {RunEvent} started @returns {RunState} */
const initialRun = (started) => ({
  story: started.story,
  base: started.base,
  artifacts: started.artifacts,
  start: started.start ?? null,
  ...untraversed(),
  ...untimed(),
  ...unfinished(),
})

/** @returns {Pick<RunState, 'closed' | 'nodes' | 'last' | 'traversals'>} */
const untraversed = () => ({
  closed: [],
  nodes: {},
  last: null,
  traversals: {},
})

/** @returns {Pick<RunState, 'phaseStarted' | 'replayMs' | 'replayWarned'>} */
const untimed = () => ({
  phaseStarted: {},
  replayMs: {},
  // Stryker disable next-line ArrayDeclaration: no phase is named like the placeholder
  replayWarned: [],
})

/** @returns {Pick<RunState, 'finished' | 'stopped' | 'attempts' | 'costUsd' | 'questions' | 'question'>} */
const unfinished = () => ({
  finished: null,
  stopped: null,
  attempts: 0,
  costUsd: null,
  questions: {},
  question: null,
})

/**
 * A run is stopped only while its last event of the run is run.stopped: an adoption of the
 * journal is no event of the run.
 * @param {RunState} run @param {RunEvent} event
 */
const apply = (run, event) => {
  if (event.type === ADOPTED) return
  run.stopped = event.type === 'run.stopped' ? event : null
  ON_EVENT[event.type]?.(run, event)
}

/** @param {RunState} run @param {RunEvent} event */
const started_ = (run, event) => {
  run.nodes[event.step] = enteredNode(run.nodes[event.step], event)
  run.phaseStarted[event.phase] ??= event.at
  run.finished = null
  run.attempts += 1
}

/** @param {NodeState | undefined} before @param {RunEvent} event @returns {NodeState} */
const enteredNode = (before, event) => {
  const open = openAttempt(event)
  return {
    visit: event.visit,
    attempt: event.attempt,
    outputs: before?.outputs ?? open.outputs,
    documents: before?.documents ?? [],
    ...thisVisit(before, open, event),
    previous: null,
  }
}

/** @param {RunEvent} event @returns {OpenAttempt} */
const openAttempt = (event) => ({
  visit: event.visit,
  attempt: event.attempt,
  phase: event.phase,
  ...nodeOf(event),
  outputs: event.outputs ?? [],
  missing: event.missing,
  feedback: event.feedback,
  sentBy: event.sentBy ?? null,
  heads: event.heads,
  group: event.group ?? null,
})

/** What the open node is: its agent, its gates or its question. @param {RunEvent} event */
const nodeOf = (event) => ({ agent: event.agent ?? null, gates: event.gates ?? null, question: event.question ?? null })

/**
 * A new visit starts from the attempt's heads and feedback; a later attempt keeps the visit's.
 * @param {NodeState | undefined} before @param {OpenAttempt} open
 * @param {RunEvent} event the step.started of the attempt
 * @returns {Pick<NodeState, 'heads' | 'sentBy' | 'redByGateFailure' | 'groups' | 'open' | 'last'>}
 */
const thisVisit = (before, open, event) => {
  if (before?.visit !== open.visit) return { heads: open.heads, sentBy: open.sentBy, redByGateFailure: open.feedback?.length > 0 && open.sentBy !== 'review' && open.sentBy !== 'ask', groups: event.groups ?? [], open, last: null }
  return { heads: before.heads, sentBy: before.sentBy, redByGateFailure: before.redByGateFailure, groups: before.groups, open, last: before.last }
}

/** @param {RunState} run @param {RunEvent} event */
const recorded = (run, event) => {
  const node = run.nodes[event.step]
  node.previous = node.last
  node.last = event
  node.documents = [...new Set([...node.documents, ...(event.documents ?? [])])]
  addTotals(run, event, /** @type {OpenAttempt} */ (node.open).phase)
  node.open = null
  run.last = event
  run.traversals[edgeKey(event.step, event.next)] = (run.traversals[edgeKey(event.step, event.next)] ?? 0) + 1
  run.question = null
}

/** What a recorded step adds to the run's replay time and cost. @param {RunState} run @param {RunEvent} event @param {string} phase */
const addTotals = (run, event, phase) => {
  if (typeof event.replayMs === 'number') run.replayMs[phase] = (run.replayMs[phase] ?? 0) + event.replayMs
  if (typeof event.cost === 'number') run.costUsd = (run.costUsd ?? 0) + event.cost
}

/** @param {RunState} run @param {RunEvent} event */
const asked = (run, event) => {
  const { key, kind, step, visit, text, options, refusals, header, subjects } = event
  run.questions[key] = { key, kind, step, visit, text, options, refusals, header, subjects, answer: null, reason: null }
  run.question = run.questions[key]
}

/**
 * Who may answer a question: a host's dialog or a button a person pressed in its pane (`host`), a
 * typed `skraft decide` (`decide`), a person confirming in Copilot's dialog (`host-confirmed`), a
 * person confirming at an interactive terminal prompt (`cli-tty`). Decide records no other provenance.
 */
export const HUMAN_PROVENANCES = Object.freeze(['host', 'decide', 'host-confirmed', 'cli-tty'])

/**
 * An environment question answered RETRY needs nothing more: the open step runs again. An
 * instruction to a blocked question gives the node it runs again a new loop budget: no edge into
 * it counts as taken any more.
 * @param {RunState} run @param {RunEvent} event
 */
const answered = (run, event) => {
  const question = run.questions[event.key]
  question.answer = event.answer
  question.reason = event.reason
  if (question.kind === 'environment' && event.answer === 'RETRY') run.question = null
  if (instructionOf(question) !== null) untraverse(run, question.step)
}

/** @param {RunState} run @param {string} step */
const untraverse = (run, step) => {
  for (const key of Object.keys(run.traversals)) if (key.endsWith(edgeKey('', step))) delete run.traversals[key]
}

/** @param {RunState} run @param {RunEvent} event */
const closed = (run, event) => {
  run.closed.push(event.phase)
}

/** @param {RunState} run @param {RunEvent} event */
const replaySlow = (run, event) => {
  run.replayWarned.push(event.phase)
}

/** @param {RunState} run @param {RunEvent} event */
const finished = (run, event) => {
  run.finished = event
}

/** @type {Readonly<Record<string, (run: RunState, event: RunEvent) => void>>} */
const ON_EVENT = Object.freeze({
  __proto__: null,
  'step.started': started_,
  'step.recorded': recorded,
  'phase.closed': closed,
  'tdd.replay-slow': replaySlow,
  'question.asked': asked,
  'question.answered': answered,
  'run.finished': finished,
})
