/**
 * @typedef {{ type: string, at: string, prev: string | null, [field: string]: any }} RunEvent
 * @typedef {{ attempt: number, phase: string, agent: string, outputs: string[], missing: string[] }} OpenAttempt
 * @typedef {{ attempts: number, outputs: string[], open: OpenAttempt | null, last: RunEvent | null }} StepState
 *   outputs: the paths of the first attempt; every retry keeps them.
 * @typedef {{
 *   slug: string | null,
 *   story: { issue?: number | null, title?: string | null } | null,
 *   base: Array<{ component: string | null, root: string, repository: string, ref: string, source: 'flag' | 'component' | 'config' | 'default', sha: string }>,
 *   closed: string[],
 *   steps: Record<string, StepState>,
 *   finished: RunEvent | null,
 *   stopped: RunEvent | null,
 *   attempts: number,
 *   costUsd: number | null,
 * }} RunState
 */

/**
 * The state of a run, derived from its events: nothing else is stored.
 * @param {RunEvent[]} events
 * @returns {RunState}
 */
export const deriveRun = (events) => {
  /** @type {RunState} */
  const run = { slug: null, story: null, base: [], closed: [], steps: {}, finished: null, stopped: null, attempts: 0, costUsd: null }
  for (const event of events) {
    run.stopped = event.type === 'run.stopped' ? event : null
    if (event.type === 'run.started' && run.slug === null) {
      run.slug = event.slug ?? null
      run.story = event.story ?? null
      run.base = Array.isArray(event.base) ? event.base : []
    } else if (event.type === 'step.started') {
      const step = stepOf(run, event.step)
      if (step.attempts === 0) step.outputs = [...event.outputs]
      step.attempts = event.attempt
      run.finished = null
      step.open = { attempt: event.attempt, phase: event.phase, agent: event.agent, outputs: [...event.outputs], missing: [...event.missing] }
      run.attempts += 1
    } else if (event.type === 'step.recorded') {
      const step = stepOf(run, event.step)
      step.open = null
      step.last = event
      if (typeof event.cost === 'number') run.costUsd = (run.costUsd ?? 0) + event.cost
    } else if (event.type === 'phase.closed') {
      run.closed.push(event.phase)
      run.finished = null
    } else if (event.type === 'run.finished') {
      run.finished = event
    }
  }
  return run
}

/** @param {RunState} run @param {string} id @returns {StepState} */
const stepOf = (run, id) => (run.steps[id] ??= { attempts: 0, outputs: [], open: null, last: null })
