/**
 * @typedef {{ type: string, at: string, prev: string | null, [field: string]: any }} RunEvent
 * @typedef {{ attempt: number, phase: string, agent: string, outputs: string[], missing: string[] }} OpenAttempt
 * @typedef {{ attempts: number, open: OpenAttempt | null, last: RunEvent | null }} StepState
 * @typedef {{
 *   slug: string | null,
 *   story: { issue?: number | null, title?: string | null } | null,
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
  const run = { slug: null, story: null, closed: [], steps: {}, finished: null, stopped: null, attempts: 0, costUsd: null }
  for (const event of events) {
    run.stopped = event.type === 'run.stopped' ? event : null
    if (event.type === 'run.started' && run.slug === null) {
      run.slug = event.slug ?? null
      run.story = event.story ?? null
    } else if (event.type === 'step.started') {
      const step = stepOf(run, event.step)
      step.attempts = event.attempt
      step.open = { attempt: event.attempt, phase: event.phase, agent: event.agent, outputs: [...event.outputs], missing: [...event.missing] }
      run.attempts += 1
    } else if (event.type === 'step.recorded') {
      const step = stepOf(run, event.step)
      step.open = null
      step.last = event
      if (typeof event.cost === 'number') run.costUsd = (run.costUsd ?? 0) + event.cost
    } else if (event.type === 'phase.closed') {
      run.closed.push(event.phase)
    } else if (event.type === 'run.finished') {
      run.finished = event
    }
  }
  return run
}

/** @param {RunState} run @param {string} id @returns {StepState} */
const stepOf = (run, id) => (run.steps[id] ??= { attempts: 0, open: null, last: null })
