/**
 * HumanInteraction on a Copilot dynamic workflow, which cannot hold a dialog: the question goes
 * to the workflow's log, then `ctx.pause(key)` pauses the run durably. The human answers with
 * the `skraft_decide` tool and resumes the run; the engine then finds the answer in the journal.
 * A resumed run whose question is still open passes the pause and gets no answer: it waits.
 *
 * @typedef {{ log: (message: string) => void, pause?: (key: string) => Promise<unknown> }} PauseContext
 * @param {{ ctx: PauseContext }} options
 * @returns {import('../../application/ports/human-interaction.mjs').HumanInteraction}
 */
export const createCtxHuman = ({ ctx }) => Object.freeze({
  ask: async ({ key, text, options, refusals }) => {
    ctx.log(`Waiting for you — ${text}`)
    ctx.log(`Answer with the skraft_decide tool (key "${key}", answer ${options.join(' or ')}${refusals.length > 0 ? `, a reason with ${refusals.join(' or ')}` : ''}), then resume this run.`)
    if (typeof ctx.pause === 'function') await ctx.pause(key)
    return null
  },
})
