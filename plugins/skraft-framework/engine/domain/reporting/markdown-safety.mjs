/**
 * What an agent wrote, made safe to publish in a pull request: GitHub acts on a closing keyword
 * followed by an issue reference and on an @mention, never inside a code span; HTML is dropped.
 * And values the engine lays out, kept on their line, in a table cell or in a code span.
 */

const TAG = /<\/?[A-Za-z][^>]*>/g
const CLOSING = /\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b(\s*:?\s*)((?:[\w.-]+\/[\w.-]+)?#\d+|GH-\d+|https?:\/\/\S+?\/issues\/\d+)/gi
const MENTION = /(^|[^\w`])@([A-Za-z0-9][\w-]*(?:\/[\w-]+)?)/g

/** An agent's text with no tag, each closing reference and each mention in a code span. @param {string} text */
export const inert = (text) => text.replace(TAG, '').replace(CLOSING, '`$1$2$3`').replace(MENTION, '$1`@$2`')

/** A text on one line. @param {string} text */
export const oneLine = (text) => text.replace(/\s*\r?\n\s*/g, ' ')

/** A value inside a Markdown table cell: on one line, its pipes escaped. @param {string} text */
export const cell = (text) => oneLine(text).replace(/\|/g, '\\|')

/** A value in a code span whose fence is longer than any run of backticks it holds. @param {string} text */
export const code = (text) => {
  const longest = Math.max(0, ...(oneLine(text).match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  return longest === 0 ? `${fence}${oneLine(text)}${fence}` : `${fence} ${oneLine(text)} ${fence}`
}
