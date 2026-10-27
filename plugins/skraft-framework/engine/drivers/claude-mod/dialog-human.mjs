/**
 * HumanInteraction on `$.ui.ask`: the question in the engine's dialog, its options as the
 * choices. A refusal chosen there, or typed in any case, asks for its reason next; other text
 * typed under "Other" is a refusal's reason when the question has one refusal. A dismissed dialog, or no one to ask, is
 * no answer: the run waits for `/skraft decide`.
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
  ask: async (question) => {
    const given = await dialog(ask, question.text, { options: question.options, header: question.header })
    if (given === null) return null
    const chosen = question.options.find((option) => option === given.trim().toUpperCase())
    if (chosen === undefined) return typed(question, given)
    return question.refusals.includes(chosen) ? withReason(ask, question, chosen) : { answer: chosen, reason: null }
  },
})

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
  return reason === null || NO_REASON.includes(reason) ? null : reason
}
