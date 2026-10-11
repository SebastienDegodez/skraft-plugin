/**
 * @typedef {{ path: string, template: string | null }} OutputSpec
 *   path is relative to the pipeline's tracking folder; `{date}` and `{slug}` are filled at dispatch.
 * @typedef {{ id: string, kind: 'dispatch', agent: string, outputs: OutputSpec[], maxAttempts: number }} StepSpec
 * @typedef {{ phase: string, steps: StepSpec[] }} PhaseSpec
 * @typedef {{ phases: PhaseSpec[] }} PipelineDefinition
 */

/** The phases of a full run, in order; a run is `completed` only once all of them closed. */
export const PIPELINE_PHASES = Object.freeze(['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])

/** @type {PipelineDefinition} */
export const DEFAULT_PIPELINE = Object.freeze({
  phases: Object.freeze([
    Object.freeze({
      phase: 'RESEARCH',
      steps: Object.freeze([
        Object.freeze({
          id: 'research',
          kind: 'dispatch',
          agent: 'solution-researcher',
          outputs: Object.freeze([Object.freeze({ path: 'research/{date}/{slug}-research.md', template: 'research.template.md' })]),
          maxAttempts: 2,
        }),
      ]),
    }),
  ]),
})
