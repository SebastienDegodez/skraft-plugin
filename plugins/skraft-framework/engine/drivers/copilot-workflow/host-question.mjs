import { readAnswer, takesInstruction } from '../../domain/decisions/questions.mjs'

/**
 * A question of the run put to the person once, in Copilot's own dialog (host-confirmation.mjs):
 * a question with options as a choice among them, one that takes an instruction (a blocked step's,
 * the mutation plan) as a text field where the person writes an option or their instruction. An
 * instruction is shown back and confirmed before it is the answer (#500: a bare digit was sent to
 * the agent as its instruction); one not confirmed is no answer either, logged as an instruction
 * not sent. An option typed, or a text the engine refuses anyway, asks no confirmation; such a
 * text is not asked again: the run waits on the question, as for any answer not given. A refusal
 * chosen asks its reason next, in a text field: the agent gets it back.
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
  if (takesInstruction(question.kind)) return instructionOf(dialog, question)
  const chosen = await dialog.choose(question.text, question.options)
  if (!chosen.ok || !question.refusals.includes(/** @type {string} */ (chosen.value))) return given(chosen, null)
  return withReason(dialog, question, /** @type {string} */ (chosen.value))
}

/**
 * What the person writes in the text field: an option as it is, an instruction once they confirm
 * it as written.
 * @param {HostDialog} dialog @param {Question} question @returns {Promise<Put>}
 */
const instructionOf = async (dialog, question) => {
  const written = await dialog.write(question.text)
  if (!written.ok || !needsConfirmation(question, /** @type {string} */ (written.value))) return given(written, null)
  const confirmed = await dialog.ask(`Send this instruction to ${stepOf(question.key)}? ${written.value.trim()}`)
  return confirmed.ok ? given(written, null) : notSent(confirmed)
}

/**
 * An instruction the person wrote, then did not send: they said no, closed the confirmation or let
 * it time out. It is `not-answered`, as any dialog not answered, with a reason that does not say
 * they gave no answer. A confirmation the host could not put keeps its own reason.
 * @param {{ ok: false, code: string, reason: string }} confirmed @returns {Put}
 */
const notSent = (confirmed) => (confirmed.code === 'not-answered' ? { ...confirmed, reason: 'you did not send the instruction you wrote' } : confirmed)

/**
 * Whether a written answer is an instruction the engine takes: neither an option nor a text it refuses.
 * @param {Question} question @param {string} text
 */
const needsConfirmation = (question, text) => {
  const reading = readAnswer(question, { answer: text })
  return reading.ok && !question.options.includes(reading.answer)
}

/** The node a question's key names: the key without its rank. @param {string} key */
const stepOf = (key) => key.replace(/-\d+$/, '')

/**
 * The refusal with the reason the person writes for it; refused as its dialog is, and when the
 * reason is blank: a refusal needs one, so it is no answer and the run waits on the question.
 * @param {HostDialog} dialog @param {Question} question @param {string} refusal @returns {Promise<Put>}
 */
const withReason = async (dialog, question, refusal) => {
  const reason = await dialog.write(`${question.header}: why ${refusal}? Your reason goes back to the agent.`)
  if (!reason.ok) return reason
  const text = /** @type {string} */ (reason.value)
  return text.trim() === '' ? { ok: false, code: 'not-answered', reason: `you gave no reason for ${refusal}, which needs one` } : given({ ok: true, value: refusal }, text)
}

/**
 * @param {import('./host-confirmation.mjs').Answered} answered @param {string | null} reason
 * @returns {Put}
 */
const given = (answered, reason) => (answered.ok ? { ok: true, given: { answer: /** @type {string} */ (answered.value), reason } } : answered)
