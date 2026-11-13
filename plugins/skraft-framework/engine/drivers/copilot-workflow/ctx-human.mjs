import { decideUsage } from '../../domain/decisions/questions.mjs'
import { askInHost } from './host-question.mjs'
import { isCancellation } from './cancellation.mjs'
import { NATIVE_GUIDANCE } from './skraft-decide-tool.mjs'
import { UNFORESEEN_GUIDANCE } from '../../domain/decisions/unforeseen.mjs'

/**
 * HumanInteraction on a Copilot dynamic workflow. A registered pipeline (null dialog) puts no
 * Copilot dialog: it logs the exact question and the native guidance, then `ctx.pause(key)`; the
 * model asks it with the host's native question tool and relays the reply through skraft_decide.
 * An injected dialog keeps Copilot's own dialog (host-question.mjs). The run never opens the
 * skraft canvas: the person asks for it.
 *
 * A run the host cancelled puts no question: it rethrows the cancellation, so that a command the
 * cancellation ended is not taken for the machine's fault and asked RETRY again and again.
 *
 * @typedef {{ log: (message: string) => void, pause: (key: string) => Promise<unknown>, signal?: AbortSignal }} PauseContext
 * @param {{ ctx: PauseContext, dialog: import('./host-confirmation.mjs').HostDialog | null }} options
 * @returns {import('../../application/ports/human-interaction.mjs').HumanInteraction}
 */
export const createCtxHuman = ({ ctx, dialog }) => Object.freeze({
  by: dialog === null ? 'decide' : dialog.by,
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
  if (dialog === null || question.kind === 'unforeseen') return waitInChat(ctx, question)
  const put = await askInHost(dialog, question)
  if (put.ok) return put.given
  ctx.log(`Waiting for you — ${question.text}`)
  ctx.log(howToAnswer(question, put.reason))
  await ctx.pause(question.key)
  return null
}

/** @param {PauseContext} ctx @param {import('../../domain/decisions/questions.mjs').Question} question */
const waitInChat = async (ctx, question) => {
  ctx.log(`${question.kind === 'unforeseen' ? 'Waiting for host judgment' : 'Waiting for you'} — ${question.text}`)
  ctx.log(JSON.stringify({ question }))
  ctx.log(question.kind === 'unforeseen' ? UNFORESEEN_GUIDANCE : NATIVE_GUIDANCE)
  await ctx.pause(question.key)
  return null
}

/**
 * Why the question was not answered, and the three ways to answer it.
 * @param {import('../../domain/decisions/questions.mjs').Question} question @param {string} why
 */
const howToAnswer = (question, why) =>
  `${question.key} was not answered: ${why}. Resume this run to be asked again, ask Copilot in the chat to put the question to you, or type skraft decide ${question.key} ${decideUsage(question)} in a terminal and resume this run.`
