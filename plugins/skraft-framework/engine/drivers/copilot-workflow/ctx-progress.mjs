/**
 * PipelineProgress on the workflow's `/workflows` view: `ctx.phase` opens the declared phase the
 * agents launched next are counted in, and the log keeps a line per transition. Copilot CLI 1.0.105
 * keeps a phase the meta does not declare as an undeclared phase (ordinal null) and does not throw
 * (probe check `workflow-undeclared-phase`), so a phase only an ejected workflow names is opened too.
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
