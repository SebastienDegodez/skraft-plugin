/**
 * @typedef {{ type: string, at: string, prev: string | null, [field: string]: any }} RunEvent
 * @typedef {{ repository: string, sha: string, dirty: Array<{ path: string, hash: string | null }> }} Head
 *   the HEAD of one repository when an attempt started, and the files then already changed
 *   (relative to the working copy), with the hash of their content (null: deleted).
 * @typedef {{
 *   visit: number, attempt: number, phase: string, agent: string | null, gates: string[] | null,
 *   outputs: string[], missing: string[], feedback: string[], sentBy: 'gate' | 'review' | null, heads: Head[],
 * }} OpenAttempt
 * @typedef {{
 *   visit: number, attempt: number, outputs: string[], documents: string[], heads: Head[], sentBack: boolean,
 *   open: OpenAttempt | null, last: RunEvent | null, previous: RunEvent | null,
 * }} NodeState
 *   visit: how many times the run entered the node; attempt: within that visit. outputs: the
 *   paths of the node's first dispatch, which every later one reuses. documents: every document of
 *   the tracking folder the node's attempts wrote, outputs included. heads: the first
 *   attempt's of this visit. sentBack: this visit started on gate failures. last and previous:
 *   this visit's last two step.recorded.
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
 * }} RunState
 *   last: the run's last step.recorded; traversals: how often each edge `from->to` was taken;
 *   phaseStarted: when the first step of each phase started; replayMs: time spent replaying
 *   red commits, per phase.
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

/** @returns {Pick<RunState, 'finished' | 'stopped' | 'attempts' | 'costUsd'>} */
const unfinished = () => ({
  finished: null,
  stopped: null,
  attempts: 0,
  costUsd: null,
})

/** A run is stopped only while its last event is run.stopped. @param {RunState} run @param {RunEvent} event */
const apply = (run, event) => {
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
    ...thisVisit(before, open),
    previous: null,
  }
}

/** @param {RunEvent} event @returns {OpenAttempt} */
const openAttempt = (event) => ({
  visit: event.visit,
  attempt: event.attempt,
  phase: event.phase,
  agent: event.agent ?? null,
  gates: event.gates ?? null,
  outputs: event.outputs ?? [],
  missing: event.missing,
  feedback: event.feedback,
  sentBy: event.sentBy ?? null,
  heads: event.heads,
})

/**
 * A new visit starts from the attempt's heads and feedback; a later attempt keeps the visit's.
 * @param {NodeState | undefined} before @param {OpenAttempt} open
 * @returns {Pick<NodeState, 'heads' | 'sentBack' | 'open' | 'last'>}
 */
const thisVisit = (before, open) => {
  if (before?.visit !== open.visit) return { heads: open.heads, sentBack: open.feedback?.length > 0 && open.sentBy !== 'review', open, last: null }
  return { heads: before.heads, sentBack: before.sentBack, open, last: before.last }
}

/** @param {RunState} run @param {RunEvent} event */
const recorded = (run, event) => {
  const node = run.nodes[event.step]
  node.previous = node.last
  node.last = event
  node.documents = [...new Set([...node.documents, ...(event.documents ?? [])])]
  const { phase } = /** @type {OpenAttempt} */ (node.open)
  if (typeof event.replayMs === 'number') run.replayMs[phase] = (run.replayMs[phase] ?? 0) + event.replayMs
  node.open = null
  run.last = event
  run.traversals[edgeKey(event.step, event.next)] = (run.traversals[edgeKey(event.step, event.next)] ?? 0) + 1
  if (typeof event.cost === 'number') run.costUsd = (run.costUsd ?? 0) + event.cost
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
  'run.finished': finished,
})
