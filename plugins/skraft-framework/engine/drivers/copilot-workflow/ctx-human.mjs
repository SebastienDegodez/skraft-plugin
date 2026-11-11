import { decideUsage } from '../../domain/decisions/questions.mjs'
import { askInHost } from './host-question.mjs'
import { isCancellation } from './cancellation.mjs'
import { NATIVE_GUIDANCE } from './skraft-decide-tool.mjs'

/**
 * Registered pipelines use a null dialog: expose the exact question in chat and pause.
 * Explicit injected dialogs retain their host-specific interaction for compatibility.
 *
 * A run the host cancelled puts no question: it rethrows the cancellation, so that a command the
 * cancellation ended is not taken for the machine's fault and asked RETRY again and again.
 *
 * @typedef {{ log: (message: string) => void, pause: (key: string) => Promise<unknown>, signal?: AbortSignal }} PauseContext
 * @param {{ ctx: PauseContext, dialog: import('./host-confirmation.mjs').HostDialog | null, canvas: import('./canvas-opener.mjs').CanvasOpener }} options
 * @returns {import('../../application/ports/human-interaction.mjs').HumanInteraction}
 */
export const createCtxHuman = ({ ctx, dialog, canvas }) => Object.freeze({
  by: dialog === null ? 'decide' : dialog.by,
  show: (view) => canvas.show(view),
  ask: (question) => askPerson(ctx, dialog, question),
})

/**
 * The person's answer in Copilot's dialog; null once the run paused on a question not answered.
 * A cancelled run asks nothing and rethrows its cancellation.
 * @param {PauseContext} ctx @param {import('./host-confirmation.mjs').HostDialog | null} dialog
 * @param {import('../../domain/decisions/questions.mjs').Question} question
 */
const askPerson = async (ctx, dialog, question) => {
  if (isCancellation(ctx.signal)) throw /** @type {AbortSignal} */ (ctx.signal).reason ?? new DOMException('Workflow run was aborted', 'AbortError')
  if (dialog === null) return waitInChat(ctx, question)
  const put = await askInHost(dialog, question)
  if (put.ok) return put.given
  ctx.log(`Waiting for you — ${question.text}`)
  ctx.log(howToAnswer(question, put.reason))
  await ctx.pause(question.key)
  return null
}

/** @param {PauseContext} ctx @param {import('../../domain/decisions/questions.mjs').Question} question */
const waitInChat = async (ctx, question) => {
  ctx.log(`Waiting for you — ${question.text}`)
  ctx.log(JSON.stringify({ question }))
  ctx.log(NATIVE_GUIDANCE)
  await ctx.pause(question.key)
  return null
}

/**
 * Why the question was not answered, and the three ways to answer it.
 * @param {import('../../domain/decisions/questions.mjs').Question} question @param {string} why
 */
const howToAnswer = (question, why) =>
  `${question.key} was not answered: ${why}. Resume this run to be asked again, ask Copilot in the chat to put the question to you, or type skraft decide ${question.key} ${decideUsage(question)} in a terminal and resume this run.`
