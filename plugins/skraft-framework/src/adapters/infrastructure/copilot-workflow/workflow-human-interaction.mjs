// HumanInteraction (ports/infrastructure/human-interaction.mjs) on a Copilot dynamic
// workflow. A workflow cannot hold a dialog, so it pauses at a durable checkpoint:
//   first attempt — ctx.pause(key) records the checkpoint and throws AbortError; the run
//                   shows as paused in /workflows;
//   the human answers with the skraft_decide tool (DecisionStore), then resumes (R);
//   resumed       — the use case finds the recorded answer before asking. If there is
//                   none, ctx.pause(key) returns at once and the answer is null: the run
//                   ends as awaiting-human.
export const createWorkflowHumanInteraction = ({ ctx }) => Object.freeze({
  ask: async ({ key, question, options }) => {
    ctx.log(`Waiting for you — ${question.split('\n')[0]}`)
    ctx.log(`Answer with the skraft_decide tool (key "${key}", one of: ${options.join(' | ')}), then resume this run.`)
    await ctx.pause(key)
    return null
  },
})
