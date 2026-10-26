/**
 * HumanInteraction on a Copilot dynamic workflow, which cannot hold a dialog: the question goes
 * to the workflow's log, then `ctx.pause(key)` pauses the run durably. The person answers (in
 * Copilot, which asks them to confirm it, or with `skraft decide` in a terminal) and resumes the
 * run; the engine then finds the answer in the journal. The log names no tool: no prompt does.
 * A resumed run whose question is still open passes the pause and gets no answer: it waits.
 *
 * @typedef {{ log: (message: string) => void, pause?: (key: string) => Promise<unknown> }} PauseContext
 * @param {{ ctx: PauseContext }} options
 * @returns {import('../../application/ports/human-interaction.mjs').HumanInteraction}
 */
export const createCtxHuman = ({ ctx }) => Object.freeze({
  ask: async ({ key, text, options, refusals }) => {
    ctx.log(`Waiting for you — ${text}`)
    ctx.log(`Answer ${key} with ${options.join(' or ')}${refusals.length > 0 ? ` (a reason with ${refusals.join(' or ')})` : ''}: Copilot asks you to confirm it, or type skraft decide in a terminal; then resume this run.`)
    if (typeof ctx.pause === 'function') await ctx.pause(key)
    return null
  },
})
