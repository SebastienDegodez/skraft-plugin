import { BLOCKED } from '../../domain/decisions/questions.mjs'

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
  ask: async (question) => {
    ctx.log(`Waiting for you — ${question.text}`)
    ctx.log(howToAnswer(question))
    if (typeof ctx.pause === 'function') await ctx.pause(question.key)
    return null
  },
})

/**
 * How the person answers: one of the options, or, to a blocked question, an instruction they
 * write themselves.
 * @param {import('../../domain/decisions/questions.mjs').Question} question
 */
const howToAnswer = ({ key, kind, options, refusals }) => (kind === BLOCKED
  ? `Answer ${key} with an instruction for the blocked step, or STOP: Copilot asks you to confirm it, or type skraft decide ${key} "<instruction>" in a terminal; then resume this run.`
  : `Answer ${key} with ${options.join(' or ')}${refusals.length > 0 ? ` (a reason with ${refusals.join(' or ')})` : ''}: Copilot asks you to confirm it, or type skraft decide in a terminal; then resume this run.`)
