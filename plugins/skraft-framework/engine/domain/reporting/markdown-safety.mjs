/**
 * What an agent wrote, made safe to publish in a pull request: GitHub acts on a closing keyword
 * followed by an issue reference and on an @mention, never inside a code span; HTML is dropped.
 * And values the engine lays out, kept on their line, in a table cell or in a code span.
 */

const TAG = /<\/?[A-Za-z][^>]*>/g
const CLOSING = /\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b(\s*:?\s*)((?:[\w.-]+\/[\w.-]+)?#\d+|GH-\d+|https?:\/\/\S+?\/issues\/\d+)/gi
const MENTION = /(^|[^\w`])@([A-Za-z0-9][\w-]*(?:\/[\w-]+)?)/g

/** An agent's text with no tag, each closing reference and each mention in a code span. @param {string} text */
export const inert = (text) => untagged(text).replace(CLOSING, '`$1$2$3`').replace(MENTION, '$1`@$2`')

/** A text without its tags, also those that dropping a tag inside them would rebuild (`<</b>b>`). @param {string} text @returns {string} */
const untagged = (text) => {
  const once = text.replace(TAG, '')
  return once === text ? text : untagged(once)
}

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

const COMMENT = /<!--[\s\S]*?(?:-->|$)/g
const HEADING = /^ {0,3}#{1,3}(?=[ \t]|$)/gm
const DANGLING = /<(?=[A-Za-z/!?])/g
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const BARE_FENCE = /^ {0,3}(`{3,}|~{3,})\s*$/

/**
 * A Markdown file an agent wrote, shown inside a section of the pull request: inert, without its
 * HTML comments nor a tag left unclosed, its headings below the description's own, and the code
 * fence it leaves open closed.
 * @param {string} text
 */
export const embedded = (text) => fenced(inert(text.replace(COMMENT, '')).replace(DANGLING, '&lt;').replace(HEADING, '####'))

/** A text with the code fence it leaves open closed. @param {string} text */
const fenced = (text) => {
  const open = openFence(text)
  return open === null ? text : `${text}\n${open.marker}`
}

/**
 * The code fence a text leaves open, where its line starts and its marker; null when it closes every one.
 * @param {string} text @returns {{ at: number, marker: string } | null}
 */
export const openFence = (text) => {
  /** @type {{ at: number, marker: string } | null} */
  let open = null
  let at = 0
  for (const line of text.split('\n')) {
    open = fenceAfter(open, line, at)
    at += line.length + 1
  }
  return open
}

/** @param {{ at: number, marker: string } | null} open @param {string} line @param {number} at */
const fenceAfter = (open, line, at) => {
  if (open !== null) return closes(line, open.marker) ? null : open
  const marker = FENCE.exec(line)?.[1]
  return marker === undefined ? null : { at, marker }
}

/** A bare fence of the same character, at least as long. @param {string} line @param {string} marker */
const closes = (line, marker) => {
  const bare = BARE_FENCE.exec(line)?.[1]
  return bare !== undefined && bare[0] === marker[0] && bare.length >= marker.length
}
