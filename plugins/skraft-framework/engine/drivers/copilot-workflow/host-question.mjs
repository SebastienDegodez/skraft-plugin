import { BLOCKED } from '../../domain/decisions/questions.mjs'

/**
 * A question of the run put to the person once, in Copilot's own dialog (host-confirmation.mjs):
 * a question with options as a choice among them, a blocked step's as a text field where the
 * person writes the instruction or STOP. What the dialog gives is the answer; nothing asks to
 * confirm it. A refusal chosen asks its reason next, in a text field: the agent gets it back.
 *
 * @typedef {import('../../domain/decisions/questions.mjs').Question} Question
 * @typedef {import('./host-confirmation.mjs').HostDialog} HostDialog
 * @typedef {import('../../application/ports/human-interaction.mjs').HumanAnswer} HumanAnswer
 * @typedef {{ ok: true, given: HumanAnswer } | { ok: false, code: string, reason: string }} Put
 */

/**
 * @param {HostDialog} dialog @param {Question} question
 * @returns {Promise<Put>}
 */
export const askInHost = async (dialog, question) => {
  if (question.kind === BLOCKED) return given(await dialog.write(question.text), null)
  const chosen = await dialog.choose(question.text, question.options)
  if (!chosen.ok || !question.refusals.includes(/** @type {string} */ (chosen.value))) return given(chosen, null)
  return withReason(dialog, question, /** @type {string} */ (chosen.value))
}

/**
 * The refusal with the reason the person writes for it; refused as its dialog is.
 * @param {HostDialog} dialog @param {Question} question @param {string} refusal @returns {Promise<Put>}
 */
const withReason = async (dialog, question, refusal) => {
  const reason = await dialog.write(`${question.header}: why ${refusal}? Your reason goes back to the agent.`)
  return reason.ok ? given({ ok: true, value: refusal }, /** @type {string} */ (reason.value)) : reason
}

/**
 * @param {import('./host-confirmation.mjs').Answered} answered @param {string | null} reason
 * @returns {Put}
 */
const given = (answered, reason) => (answered.ok ? { ok: true, given: { answer: /** @type {string} */ (answered.value), reason } } : answered)
