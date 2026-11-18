/**
 * Finds the human's answer to the pending question in the issue's comments: the latest comment
 * whose first non-blank line is `/skraft-answer <key> <ANSWER>` left by someone else than the
 * signed-in bot. The reason is the `reason: <text>` line that follows, when there is one.
 * The bot's own comments are ignored so the ask the bot wrote is never mistaken for an answer.
 */

/** @typedef {{ login: string, body: string, url: string }} IssueComment */
/** @typedef {{ key: string, answer: string, reason: string | null, url: string }} PickedAnswer */

const SLASH = /^\/skraft-answer\s+(\S+)\s+(\S+)(?:\s*\n\s*reason:\s*(.+?))?\s*$/s

/**
 * @param {IssueComment[]} comments @param {string} botLogin
 * @returns {PickedAnswer | null}
 */
export const pickAnswerFrom = (comments, botLogin) => {
  for (const comment of [...comments].reverse()) {
    if (comment.login === botLogin) continue
    const match = SLASH.exec(firstBlock(comment.body))
    if (match) return { key: match[1], answer: match[2], reason: match[3]?.trim() ?? null, url: comment.url }
  }
  return null
}

/** The body's first block: lines up to a blank line, or the whole body. @param {string} body */
const firstBlock = (body) => {
  const blank = body.indexOf('\n\n')
  return blank === -1 ? body.trimStart() : body.slice(0, blank).trimStart()
}
