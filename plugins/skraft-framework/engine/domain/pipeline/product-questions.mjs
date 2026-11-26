/**
 * The product questions of a research document, as DESIGN reads them: each a numbered entry
 * (`Q1`, `Q2`…) whose level is the first of the literal markers `Assumption:`, `Open question:`
 * or `Unknown:` it holds, and which a `Decision:` line answers. Only those markers are read,
 * whatever the case, a bold or a space before the colon, wherever the entry sits and whatever
 * language the document's headings are in: an entry runs from its `Q<n>` line to the next entry
 * or heading.
 */

/** A line that opens an entry: a list marker or none, bold or not, then `Q<n>`. */
const ENTRY = /^\s{0,3}(?:(?:[-*+]|\d+[.)])\s+)?(?:\*\*|__)?(Q\d+)\b(.*)$/i
const HEADING = /^\s{0,3}#{1,6}\s/
const LEVEL = /\b(assumption|open question|unknown)(?:\*\*|__)?\s*:/i
const DECISION = /\bdecision(?:\*\*|__)?\s*:/i
/** What opens an entry's line before its question: punctuation, then its marker when it comes first. */
const LEADING = /^(?:\*\*|__)?[\s.:)—–-]*(?:(?:\*\*|__)?(?:assumption|open question|unknown)(?:\*\*|__)?\s*:(?:\*\*|__)?)?/i
/** How much of an entry's first line names its question in a refusal. */
const SHOWN = 120

/** @typedef {{ id: string, lines: string[] }} Entry */

/**
 * The entries still `Unknown:` with no `Decision:`, each by its number and the start of its line.
 * @param {string} text @returns {Array<{ id: string, question: string }>}
 */
export const openUnknowns = (text) => entriesOf(text)
  .filter((entry) => levelOf(entry) === 'unknown' && !entry.lines.some((line) => DECISION.test(line)))
  .map(({ id, lines }) => ({ id: id.toUpperCase(), question: shown(lines[0]) }))

/** @param {string} text @returns {Entry[]} */
const entriesOf = (text) => text.split(/\r?\n/).reduce(addLine, /** @type {{ entries: Entry[], open: Entry | null }} */ ({ entries: [], open: null })).entries

/** @param {{ entries: Entry[], open: Entry | null }} state @param {string} line */
const addLine = (state, line) => {
  const opened = ENTRY.exec(line)
  if (opened !== null) return opening(state, { id: opened[1], lines: [opened[2]] })
  if (HEADING.test(line)) return { ...state, open: null }
  state.open?.lines.push(line)
  return state
}

/** @param {{ entries: Entry[] }} state @param {Entry} entry */
const opening = ({ entries }, entry) => ({ entries: [...entries, entry], open: entry })

/** The first marker the entry holds, lower case; null for none. @param {Entry} entry */
const levelOf = ({ lines }) => LEVEL.exec(lines.join('\n'))?.[1].toLowerCase() ?? null

/** @param {string} line */
const shown = (line) => {
  const text = line.replace(LEADING, '').trim()
  return text.length > SHOWN ? `${text.slice(0, SHOWN - 1).trimEnd()}…` : text
}
