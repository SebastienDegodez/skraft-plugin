/**
 * @typedef {import('./pipeline-definition.mjs').PipelineDefinition} PipelineDefinition
 * @typedef {import('./pipeline-definition.mjs').StepSpec} StepSpec
 * @typedef {import('../journal/run-state.mjs').RunState} RunState
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ kind?: undefined, phase: string, step: StepSpec, attempt: number, missing: string[],
 *   outputs: string[] | null, resumed: import('../journal/run-state.mjs').OpenAttempt | null }} DispatchStep
 * @typedef {{ kind: 'blocked', phase: string, step: StepSpec, missing: string[] }} BlockedStep
 * @typedef {{ kind: 'close-phase', phase: string }} ClosePhaseStep
 * @typedef {{ kind: 'done', phase: string | null }} DoneStep
 * @typedef {DispatchStep | BlockedStep | ClosePhaseStep | DoneStep} NextStep
 */

/**
 * What the run does next, from its definition and its derived state.
 * @param {PipelineDefinition} definition
 * @param {RunState} run
 * @returns {NextStep}
 */
export const nextStep = (definition, run) => {
  for (const { phase, steps } of definition.phases) {
    if (run.closed.includes(phase)) continue
    for (const step of steps) {
      const state = run.steps[step.id]
      if (!state) return { phase, step, attempt: 1, missing: [], outputs: null, resumed: null }
      if (state.open) return { phase, step, attempt: state.open.attempt, missing: state.open.missing, outputs: state.open.outputs, resumed: state.open }
      const { missing } = /** @type {RunEvent} */ (state.last)
      if (missing.length === 0) continue
      if (state.attempts >= step.maxAttempts) return { kind: 'blocked', phase, step, missing }
      return { phase, step, attempt: state.attempts + 1, missing, outputs: state.outputs, resumed: null }
    }
    return { kind: 'close-phase', phase }
  }
  return { kind: 'done', phase: run.closed.at(-1) ?? null }
}
