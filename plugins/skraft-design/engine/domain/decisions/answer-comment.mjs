/**
 * A reply posted in a pull request comment: `/skraft-answer` and one JSON object naming the
 * pending question's key and its answer, a text or, for the architect's open questions, an object
 * of answers (#662). Anything else in the comment is no reply.
 */
const COMMAND = '/skraft-answer'
const NOT_A_REPLY = `a reply is ${COMMAND} followed by one JSON object, such as {"key":"…","answer":"…"}`

/** @param {string} text @returns {unknown} */
const parsed = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** @param {unknown} answer */
const answerShape = (answer) => (typeof answer === 'string' && answer.trim() !== '') || (answer !== null && typeof answer === 'object' && !Array.isArray(answer))

/**
 * @param {unknown} body the comment as the forge gives it
 * @returns {{ ok: true, key: string, answer: unknown } | { ok: false, reason: string }}
 */
export const readAnswerComment = (body) => {
  const text = typeof body === 'string' ? body.trim() : ''
  if (!text.startsWith(`${COMMAND} `)) return { ok: false, reason: NOT_A_REPLY }
  const reply = /** @type {any} */ (parsed(text.slice(COMMAND.length).trim()))
  if (typeof reply?.key !== 'string' || reply.key.trim() === '' || !answerShape(reply.answer)) return { ok: false, reason: NOT_A_REPLY }
  return { ok: true, key: reply.key.trim(), answer: reply.answer }
}
