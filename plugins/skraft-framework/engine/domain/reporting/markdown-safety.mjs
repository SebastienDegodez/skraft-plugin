/**
 * What an agent wrote, made safe to publish in a pull request: GitHub acts on a closing keyword
 * followed by an issue reference and on an @mention, never inside a code span; HTML is dropped.
 * And values the engine lays out, kept on their line, in a table cell or in a code span.
 */

const TAG = /<\/?[A-Za-z][^>\n]*>/g
const CLOSING = /\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b(\s*:?\s*)((?:[\w.-]+\/[\w.-]+)?#\d+|GH-\d+|https?:\/\/\S+?\/issues\/\d+)/gi
const MENTION = /(^|[^\w`])@([A-Za-z0-9][\w-]*(?:\/[\w-]+)?)/g

/** An agent's text with no tag, each closing reference and each mention in a code span. @param {string} text */
export const inert = (text) => referenceless(untagged(text))

/** @param {string} text */
const referenceless = (text) => text.replace(CLOSING, '`$1$2$3`').replace(MENTION, '$1`@$2`')

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
const OPENER = /^ {0,3}(?:(`{3,})(?=[^`]*$)|(~{3,}))/
const BARE_FENCE = /^ {0,3}(`{3,}|~{3,})\s*$/
const INDENTED_FENCE = /^([ \t]+)(?=`{3,}[^`]*$|~{3,})/
// What an embedded file refers to or notifies: a closing keyword and its reference, a mention, a bare #12.
const BARE = new RegExp([CLOSING.source.replace('\\S+?', '[^\\s|]+?'), '(?<!\\w)@[A-Za-z0-9][\\w-]*(?:\\/[\\w-]+)?', '(?<![\\w&#])(?:[\\w.-]+\\/[\\w.-]+)?#\\d+\\b'].join('|'), 'gi')

/**
 * A Markdown file an agent wrote, shown inside a section of the pull request, GitHub's reading of
 * it kept: only column 0 opens a code fence (an indented one, which a list item would read
 * differently, is escaped) and a fence left open is dropped with what follows it, never closed.
 * A fence is shown as written; everything else, code spans included (a table row cuts them), has no
 * comment nor tag left unclosed, its ATX headings below the description's own, and each closing
 * keyword, mention and bare issue reference in a code span.
 * @param {string} text
 */
export const embedded = (text) => referred(settled(text))

/** The text redone until nothing changes, as a rewrite can make a fence. @param {string} text @returns {string} */
const settled = (text) => {
  const next = blocksOf(text).filter(shown).map(rewritten).join('\n')
  return next === text ? text : settled(next)
}

/** The text with what it refers to in a code span whose backtick run no run of the text equals, set apart from a backtick next to it. @param {string} text */
const referred = (text) => {
  const fence = '`'.repeat(unusedRun(text))
  return blocksOf(text).map(({ marker, lines }) => (marker === null ? referringIn(lines.join('\n'), fence) : lines.join('\n'))).join('\n')
}

/** @param {string} prose @param {string} fence */
const referringIn = (prose, fence) => prose.replace(BARE, (match, ...rest) => {
  const [offset, whole] = rest.slice(-2)
  const apart = (char) => (char === '`' || char === '\\' ? ' ' : '')
  return `${apart(whole[offset - 1])}${fence}${match}${fence}${apart(whole[offset + match.length])}`
})

/** The shortest length of backtick run the text has none of. @param {string} text */
const unusedRun = (text) => {
  const used = new Set((text.match(/`+/g) ?? []).map((run) => run.length))
  let length = 1
  while (used.has(length)) length += 1
  return length
}

/** @typedef {{ marker: string | null, done: boolean, lines: string[] }} Block marker: of the fence; null for prose */

/** The blocks of a text: runs of prose and code fences, each fence whole or left open. @param {string} text @returns {Block[]} */
const blocksOf = (text) => text.split('\n').reduce(addLine, /** @type {Block[]} */ ([]))

/** @param {Block[]} blocks @param {string} line */
const addLine = (blocks, line) => {
  const last = blocks.at(-1)
  if (last?.marker && !last.done) return into(blocks, last, line, closes(line, last.marker))
  const marker = /^[`~]/.test(line) ? opening(line) : null
  if (marker !== null) return [...blocks, { marker, done: false, lines: [line] }]
  return last?.marker === null ? into(blocks, last, line, false) : [...blocks, { marker: null, done: false, lines: [line] }]
}

/** @param {Block[]} blocks @param {Block} block @param {string} line @param {boolean} done */
const into = (blocks, block, line, done) => {
  block.lines.push(line)
  block.done = done
  return blocks
}

/** The marker of the code fence a line opens, null for none: a backtick fence's info string holds no backtick. @param {string} line @returns {string | null} */
export const opening = (line) => {
  const found = OPENER.exec(line)
  return found === null ? null : found[1] ?? found[2]
}

/** A fence that is closed, or prose. @param {Block} block */
const shown = (block) => block.marker === null || block.done

/** @param {Block} block */
const rewritten = ({ marker, lines }) => (marker === null ? prose(lines.join('\n')) : lines.join('\n'))

/** Prose with its fence-like lines escaped, headings lowered, without comment nor tag. @param {string} text */
const prose = (text) => tagless(lowered(text))

/** @param {string} text */
const lowered = (text) => text.split('\n').map((line) => line.replace(INDENTED_FENCE, '$1\\')).join('\n').replace(HEADING, '####')

/** @param {string} piece */
const tagless = (piece) => untagged(piece.replace(COMMENT, '')).replace(DANGLING, '&lt;')

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
  const marker = opening(line)
  return marker === null ? null : { at, marker }
}

/** A bare fence of the same character, at least as long. @param {string} line @param {string} marker */
const closes = (line, marker) => {
  const bare = BARE_FENCE.exec(line)?.[1]
  return bare !== undefined && bare[0] === marker[0] && bare.length >= marker.length
}
