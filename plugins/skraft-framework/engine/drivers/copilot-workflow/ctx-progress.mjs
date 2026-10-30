/**
 * PipelineProgress on the workflow's `/workflows` view: `ctx.phase` opens the phase the agents
 * launched next are counted in, and the log keeps a line per transition. Every phase is relayed,
 * also one the workflow's `meta.phases` does not declare: Copilot CLI 1.0.105 accepts it, ends the
 * run `completed` and lists it with `ordinal: null` (host probe `workflow-undeclared-phase`).
 * `meta` is frozen at join, before the session's directory is known, so the phases of an ejected
 * workflow cannot be declared.
 * @param {{ ctx: { phase: (title: string) => void, log: (message: string) => void } }} options
 * @returns {import('../../application/ports/pipeline-progress.mjs').PipelineProgress}
 */
export const createCtxProgress = ({ ctx }) => Object.freeze({
  phase: (phase) => {
    ctx.phase(phase)
    ctx.log(`phase ${phase}`)
  },
  log: (message) => ctx.log(message),
})
