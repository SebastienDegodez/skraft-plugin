/**
 * PipelineProgress on the workflow's `/workflows` log.
 * @param {{ ctx: { log: (message: string) => void } }} options
 * @returns {import('../../application/ports/pipeline-progress.mjs').PipelineProgress}
 */
export const createCtxProgress = ({ ctx }) => Object.freeze({
  phase: (phase) => ctx.log(`phase ${phase}`),
  log: (message) => ctx.log(message),
})
