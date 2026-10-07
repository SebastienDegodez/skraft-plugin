// PipelineProgress (ports/infrastructure/pipeline-progress.mjs) on a Copilot dynamic
// workflow: phases and progress lines shown in /workflows and the invoke_workflow span.
export const createWorkflowProgress = ({ ctx }) => Object.freeze({
  phase: (title) => ctx.phase(title),
  log: (message) => ctx.log(message),
})
