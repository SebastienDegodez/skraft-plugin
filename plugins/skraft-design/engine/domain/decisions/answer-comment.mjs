/**
 * A reply posted in a comment: `/skraft-answer`, then the answer as a person writes it (#662):
 * - one line per open question, `Q1: B`, `q2 = keep the basket` (an option or their own words);
 * - one word or line for a question with options, `continue`;
 * - or one JSON object, `{"key":"…","answer":…}`, as before.
 * The key may be left out: the reply then answers the one decision the run waits on. A comment
 * that does not start with `/skraft-answer` is no reply; no model reads any of it.
 */
const COMMAND = '/skraft-answer'
const NOT_A_REPLY = `a reply is ${COMMAND}, then one line per question such as "Q1: B", or one option, or one JSON object such as {"key":"…","answer":"…"}`
/** A line that answers one question: its id, then what the person chose or wrote. */
const QUESTION_LINE = /^(Q\d+)\b\s*[:=-]?\s*(.+)$/i

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

/** @typedef {{ ok: true, key: string | null, answer: unknown } | { ok: false, reason: string }} CommentReading */

/** The JSON form: its key and its answer. @param {string} rest @returns {CommentReading} */
const jsonReply = (rest) => {
  const reply = /** @type {any} */ (parsed(rest))
  if (!answerShape(reply?.answer) || (reply.key !== undefined && (typeof reply.key !== 'string' || reply.key.trim() === ''))) return { ok: false, reason: NOT_A_REPLY }
  return { ok: true, key: typeof reply.key === 'string' ? reply.key.trim() : null, answer: reply.answer }
}

/** The free form: one line per question, or one line for an option. @param {string[]} lines @returns {CommentReading} */
const freeReply = (lines) => {
  const answers = lines.map((line) => QUESTION_LINE.exec(line))
  if (answers.every((match) => match !== null)) return { ok: true, key: null, answer: Object.fromEntries(answers.map((match) => [match[1].toUpperCase(), match[2].trim()])) }
  return lines.length === 1 ? { ok: true, key: null, answer: lines[0] } : { ok: false, reason: NOT_A_REPLY }
}

/**
 * @param {unknown} body the comment as the forge gives it
 * @returns {CommentReading}
 */
export const readAnswerComment = (body) => {
  const text = typeof body === 'string' ? body.replaceAll('\r\n', '\n').trim() : ''
  if (text !== COMMAND && !/^\/skraft-answer\s/.test(text)) return { ok: false, reason: NOT_A_REPLY }
  const rest = text.slice(COMMAND.length).trim()
  if (rest.startsWith('{')) return jsonReply(rest)
  const lines = rest.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  return lines.length === 0 ? { ok: false, reason: NOT_A_REPLY } : freeReply(lines)
}
