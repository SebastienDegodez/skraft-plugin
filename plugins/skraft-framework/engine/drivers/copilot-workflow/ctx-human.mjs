import { decideUsage } from '../../domain/decisions/questions.mjs'
import { askInHost } from './host-question.mjs'

/**
 * HumanInteraction on a Copilot dynamic workflow: the question is put to the person once, in
 * Copilot's own dialog, during the run (host-question.mjs); what they give is the answer,
 * journaled with the dialog's provenance. When Copilot cannot put it, or the person does not
 * answer, the run says so in its log, with how to answer, and `ctx.pause(key)` pauses it durably;
 * resumed, the run puts the question again. The log names no tool: no prompt does.
 *
 * @typedef {{ log: (message: string) => void, pause: (key: string) => Promise<unknown> }} PauseContext
 * @param {{ ctx: PauseContext, dialog: import('./host-confirmation.mjs').HostDialog }} options
 * @returns {import('../../application/ports/human-interaction.mjs').HumanInteraction}
 */
export const createCtxHuman = ({ ctx, dialog }) => Object.freeze({
  by: dialog.by,
  ask: async (question) => {
    const put = await askInHost(dialog, question)
    if (put.ok) return put.given
    ctx.log(`Waiting for you — ${question.text}`)
    ctx.log(howToAnswer(question, put.reason))
    await ctx.pause(question.key)
    return null
  },
})

/**
 * Why the question was not answered, and the three ways to answer it.
 * @param {import('../../domain/decisions/questions.mjs').Question} question @param {string} why
 */
const howToAnswer = (question, why) =>
  `${question.key} was not answered: ${why}. Resume this run to be asked again, ask Copilot in the chat to put the question to you, or type skraft decide ${question.key} ${decideUsage(question)} in a terminal and resume this run.`
