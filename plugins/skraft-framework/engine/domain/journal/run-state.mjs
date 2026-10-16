/**
 * @typedef {{ type: string, at: string, prev: string | null, [field: string]: any }} RunEvent
 * @typedef {{ repository: string, sha: string, dirty: string[] }} Head
 *   the HEAD of one repository when an attempt started, and the files then already changed
 *   (relative to the working copy).
 * @typedef {{
 *   visit: number, attempt: number, phase: string, agent: string | null, gates: string[] | null,
 *   outputs: string[], result: string | null, missing: string[], feedback: string[], heads: Head[],
 * }} OpenAttempt
 * @typedef {{
 *   visit: number, attempt: number, outputs: string[], heads: Head[],
 *   open: OpenAttempt | null, last: RunEvent | null, previous: RunEvent | null,
 * }} NodeState
 *   visit: how many times the run entered the node; attempt: within that visit. outputs: the
 *   paths of the node's first dispatch, which every later one reuses. heads: the first
 *   attempt's of this visit. last and previous: this visit's last two step.recorded.
 * @typedef {{
 *   story: { issue?: number | null, title?: string | null } | null,
 *   base: Array<{ component: string | null, root: string, repository: string, ref: string, source: 'flag' | 'component' | 'config' | 'default', sha: string }>,
 *   artifacts: string[],
 *   start: string | null,
 *   unlocked: Array<{ node: string, reason: string }>,
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
  /** @type {RunState} */
  const run = {
    story: started.story,
    base: started.base,
    artifacts: started.artifacts ?? [],
    start: started.start ?? null,
    unlocked: started.unlocked ?? [],
    closed: [],
    nodes: {},
    last: null,
    traversals: {},
    phaseStarted: {},
    replayMs: {},
    replayWarned: [],
    finished: null,
    stopped: null,
    attempts: 0,
    costUsd: null,
  }
  for (const event of events) {
    run.stopped = event.type === 'run.stopped' ? event : null
    if (event.type === 'step.started') started_(run, event)
    else if (event.type === 'step.recorded') recorded(run, event)
    else if (event.type === 'phase.closed') {
      run.closed.push(event.phase)
      run.finished = null
    } else if (event.type === 'tdd.replay-slow') run.replayWarned.push(event.phase)
    else if (event.type === 'run.finished') run.finished = event
  }
  return run
}

/** @param {RunState} run @param {RunEvent} event */
const started_ = (run, event) => {
  const before = run.nodes[event.step]
  const sameVisit = before?.visit === event.visit
  const open = {
    visit: event.visit,
    attempt: event.attempt,
    phase: event.phase,
    agent: event.agent ?? null,
    gates: event.gates ?? null,
    outputs: event.outputs ?? [],
    result: event.result ?? null,
    missing: event.missing ?? [],
    feedback: event.feedback ?? [],
    heads: event.heads ?? [],
  }
  run.nodes[event.step] = {
    visit: event.visit,
    attempt: event.attempt,
    outputs: before?.outputs ?? open.outputs,
    heads: sameVisit ? before.heads : open.heads,
    open,
    last: sameVisit ? before.last : null,
    previous: sameVisit ? before.previous : null,
  }
  run.phaseStarted[event.phase] ??= event.at
  run.finished = null
  run.attempts += 1
}

/** @param {RunState} run @param {RunEvent} event */
const recorded = (run, event) => {
  const node = run.nodes[event.step]
  node.previous = node.last
  node.last = event
  const { phase } = /** @type {OpenAttempt} */ (node.open)
  if (typeof event.replayMs === 'number') run.replayMs[phase] = (run.replayMs[phase] ?? 0) + event.replayMs
  node.open = null
  run.last = event
  if (event.next) run.traversals[edgeKey(event.step, event.next)] = (run.traversals[edgeKey(event.step, event.next)] ?? 0) + 1
  if (typeof event.cost === 'number') run.costUsd = (run.costUsd ?? 0) + event.cost
}
