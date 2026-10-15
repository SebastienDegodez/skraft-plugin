/**
 * @typedef {{ path: string, template: string | null }} OutputSpec
 *   path is relative to the pipeline's tracking folder; `{date}` and `{slug}` are filled at dispatch.
 * @typedef {{ id: string, agent: string, outputs: readonly OutputSpec[], maxAttempts: number }} StepSpec
 * @typedef {{ phase: string, steps: readonly StepSpec[] }} PhaseSpec
 * @typedef {{ phases: readonly PhaseSpec[] }} PipelineDefinition
 */

/** @type {PipelineDefinition} */
export const DEFAULT_PIPELINE = Object.freeze({
  phases: Object.freeze([
    Object.freeze({
      phase: 'RESEARCH',
      steps: Object.freeze([
        Object.freeze({
          id: 'research',
          agent: 'solution-researcher',
          outputs: Object.freeze([Object.freeze({ path: 'research/{date}/{slug}-research.md', template: 'research.template.md' })]),
          maxAttempts: 2,
        }),
      ]),
    }),
  ]),
})
