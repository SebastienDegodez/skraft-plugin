import { readAnswer, takesInstruction } from '../../domain/decisions/questions.mjs'

/**
 * HumanInteraction on `$.ui.ask`: the question in the engine's dialog, its options as the
 * choices. A refusal chosen there, or typed in any case, asks for its reason next; other text
 * typed under "Other" is a refusal's reason when the question has one refusal. An instruction
 * typed under "Other" is shown back and recorded only once sent (#500); a text the engine refuses
 * (no word in it), or an instruction not sent, puts the question again, at most MAX_ROUNDS times.
 * A dismissed dialog, or no one to ask, is no answer: the run waits for `/skraft decide`.
 *
 * @typedef {(question: string, options: { options: readonly string[], header: string }) => Promise<string>} AskDialog
 *   `$.ui.ask`: the label chosen, or the text typed under "Other"; rejects when dismissed.
 * @typedef {import('../../application/ports/human-interaction.mjs').HumanInteraction} HumanInteraction
 * @typedef {import('../../application/ports/human-interaction.mjs').HumanAnswer} HumanAnswer
 * @typedef {import('../../application/ports/human-interaction.mjs').Question} Question
 */

/** The choices of the dialog that asks a refusal's reason; picking one gives none. */
export const NO_REASON = Object.freeze(['Not now', 'Answer later'])

/**
 * @param {{ ask: AskDialog }} host
 * @returns {HumanInteraction}
 */
export const createDialogHuman = ({ ask }) => Object.freeze({
  ask: (question) => (takesInstruction(question.kind) ? instructed(ask, question, MAX_ROUNDS) : answered(ask, question)),
})

/** How often a question that takes an instruction is put before the run waits for `/skraft decide`. */
const MAX_ROUNDS = 3
/** The choices of the dialog that shows an instruction back. */
export const SEND = Object.freeze(['SEND', 'CANCEL'])

/** An option chosen, a refusal with its reason, or text typed. @param {AskDialog} ask @param {Question} question @returns {Promise<HumanAnswer | null>} */
const answered = async (ask, question) => {
  const given = await dialog(ask, question.text, { options: question.options, header: question.header })
  if (given === null) return null
  const chosen = question.options.find((option) => option === given.trim().toUpperCase())
  if (chosen === undefined) return typed(question, given)
  return question.refusals.includes(chosen) ? withReason(ask, question, chosen) : { answer: chosen, reason: null }
}

/**
 * An option, or an instruction the person sent once shown it back; asked again after a text the
 * engine refuses or an instruction not sent, null once the rounds are spent or the dialog dismissed.
 * @param {AskDialog} ask @param {Question} question @param {number} rounds @returns {Promise<HumanAnswer | null>}
 */
const instructed = async (ask, question, rounds) => {
  if (rounds === 0) return null
  const given = await answered(ask, question)
  if (given === null) return null
  const reading = readAnswer(question, given)
  if (reading.ok && question.options.includes(reading.answer)) return given
  return reading.ok && (await sent(ask, question, reading.answer)) ? given : instructed(ask, question, rounds - 1)
}

/** Whether the person sends the instruction shown back to them. @param {AskDialog} ask @param {Question} question @param {string} instruction */
const sent = async (ask, question, instruction) => (await dialog(ask, `Send this instruction to ${question.key.replace(/-\d+$/, '')}? ${instruction}`, { options: SEND, header: question.header })) === SEND[0]

/** @param {AskDialog} ask @param {string} text @param {{ options: readonly string[], header: string }} options */
const dialog = async (ask, text, options) => {
  try {
    return await ask(text, options)
  } catch {
    return null
  }
}

/** Text typed under "Other": a reason for the question's one refusal, else the answer as typed. @param {Question} question @param {string} text @returns {HumanAnswer} */
const typed = (question, text) => (question.refusals.length === 1 ? { answer: question.refusals[0], reason: text } : { answer: text, reason: null })

/** @param {AskDialog} ask @param {Question} question @param {string} refusal @returns {Promise<HumanAnswer | null>} */
const withReason = async (ask, question, refusal) => {
  const reason = await refusalReason(ask, refusal, question.header)
  return reason === null ? null : { answer: refusal, reason }
}

/**
 * The reason a person types for a refusal, in its own dialog; null when they give none.
 * @param {AskDialog} ask @param {string} refusal @param {string} header @returns {Promise<string | null>}
 */
export const refusalReason = async (ask, refusal, header) => {
  const reason = await dialog(ask, `Why ${refusal}? Type the reason under Other; it goes back to the agent.`, { options: NO_REASON, header })
  return NO_REASON.includes(/** @type {string} */ (reason)) ? null : reason
}
