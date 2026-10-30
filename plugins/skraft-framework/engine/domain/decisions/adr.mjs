/**
 * ADRs as the engine reads them: `docs/adr/adr-NNN-<subject>.md`, a YAML header with `status`,
 * `supersedes`, `ratified_by`…, a `**Status:**` line, and the `docs/adr/decisions-index.md` digest.
 * An ADR is published once it is on the run's base; until then it is edited in place (#209).
 */

export const ADR_FOLDER = 'docs/adr'
export const ADR_INDEX = `${ADR_FOLDER}/decisions-index.md`
const ADR_FILE = /^docs\/adr\/adr-(\d+)[^/]*\.md$/i
const HEADER = /^(?:<!--[^\n]*-->\s*\n)?---\r?\n([\s\S]*?)\r?\n---/
/** Header keys that tell the story of an ADR's drafts: never on an unpublished one. */
const DRAFT_HISTORY = Object.freeze(['amended_by', 'amended_in_place', 'superseded_by'])
/** Header keys that point at another ADR: only at a published one. */
const LINKS = Object.freeze(['supersedes', 'amends'])
const HISTORY_SECTION = /^##\s+(?:Historique|History|Historic)\b/im

/** The number of the ADR a path names; null for any other file. @param {string} path relative to the working copy */
export const adrNumber = (path) => {
  const match = ADR_FILE.exec(path)
  return match === null ? null : Number(match[1])
}

/** @param {string} text */
export const headerOf = (text) => HEADER.exec(text)?.[1] ?? null

/**
 * A header field's value, unquoted; null when the header or the field is absent, or holds null.
 * @param {string} text @param {string} key
 */
export const field = (text, key) => {
  const header = headerOf(text)
  const line = header === null ? null : new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*(?:#.*)?$`, 'm').exec(header)
  const value = line?.[1].replace(/^["']|["']$/g, '').trim() ?? ''
  return value === '' || value === 'null' || value === '~' ? null : value
}

/** The title the ADR's header gives; null without one. @param {string} text */
export const adrTitle = (text) => field(text, 'title')

/**
 * The status the ADR declares: its header's, else its `**Status:**` line's first word.
 * @param {string} text
 */
export const adrStatus = (text) => {
  const fromHeader = field(text, 'status')
  if (fromHeader !== null) return fromHeader.split(/\s/)[0]
  return /^\*\*Status:\*\*\s*([A-Za-z]+)/m.exec(text)?.[1] ?? null
}

/**
 * The ADR marked Accepted by a human on that day: header status and ratified_by, the
 * `**Status:**` line, every other byte kept.
 * @param {string} text @param {string} day YYYY-MM-DD
 */
export const ratified = (text, day) => {
  const header = headerOf(text)
  const stamped = header === null ? text : text.replace(header, () => header
    .replace(/^status:.*$/m, 'status: Accepted')
    .replace(/^ratified_by:.*$/m, () => `ratified_by: "human ${day}"`))
  return stamped.replace(/^\*\*Status:\*\*.*$/m, '**Status:** Accepted')
}

/**
 * The decisions index with the ADR's row marked Accepted and ratified by a human that day; the
 * text as it was when it has no such row.
 * @param {string} index @param {number} number @param {string} day YYYY-MM-DD
 */
export const ratifiedInIndex = (index, number, day) => {
  const lines = index.split('\n')
  const header = lines.findIndex((line) => /^\|\s*ADR\s*\|/i.test(line))
  if (header < 0) return index
  const columns = cellsOf(lines[header]).map((cell) => cell.toLowerCase())
  const status = columns.indexOf('status')
  const by = columns.indexOf('ratified by')
  return lines.map((line, at) => (at > header + 1 && rowNumber(line) === number ? withCells(line, { [status]: 'Accepted', [by]: `human ${day}` }) : line)).join('\n')
}

/** @param {string} line */
const cellsOf = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())

/** @param {string} line */
const rowNumber = (line) => {
  const first = line.startsWith('|') ? cellsOf(line)[0] : null
  const digits = first === null ? null : /(\d+)/.exec(first)
  return digits === null ? null : Number(digits[1])
}

/** @param {string} line @param {Record<number, string>} changes by column; a column -1 is left out */
const withCells = (line, changes) => {
  const cells = cellsOf(line).map((cell, column) => (column in changes ? changes[column] : cell))
  return `| ${cells.join(' | ')} |`
}

/**
 * The numbers of the ADRs an ADR links to by `supersedes` or `amends`: in its header, and in
 * its `**Supersedes:**` lines; each link once.
 * @param {string} text
 * @returns {Array<{ key: string, number: number }>}
 */
export const linkedAdrs = (text) => {
  const links = [
    ...LINKS.flatMap((key) => [...listed(text, key).matchAll(ADR_REFERENCE)].map((match) => ({ key, number: Number(match[1] ?? match[2]) }))),
    ...supersededInText(text).map((number) => ({ key: 'supersedes', number })),
  ]
  return [...new Map(links.map((link) => [`${link.key} ${link.number}`, link])).values()]
}

/** The `**Supersedes:** ADR-MMM` line of the ADR template, the reference linked or not. */
const SUPERSEDES_LINE = /\*\*Supersedes:\*\*\s*\[?ADR-(\d+)/gi

/**
 * The numbers of the ADRs an ADR's `**Supersedes:**` lines name.
 * @param {string} text
 */
export const supersededInText = (text) => [...text.matchAll(SUPERSEDES_LINE)].map((match) => Number(match[1]))

/** `ADR-001`, `ADR001` or a bare number, never a part of a date or a word. */
const ADR_REFERENCE = /\bADR-?(\d+)\b|(?<![\w-])(\d+)(?![\w-])/gi

/**
 * A header field's value with the YAML list lines under it, comments left out.
 * @param {string} text @param {string} key
 */
const listed = (text, key) => {
  const block = new RegExp(`^${key}:([^\\n]*(?:\\n[ \\t]+-[^\\n]*)*)`, 'm').exec(headerOf(text) ?? '')
  return (block?.[1] ?? '').replace(/#[^\n]*/g, '')
}

/**
 * What an unpublished ADR the attempt changed must not carry: a status other than Proposed, a
 * draft history. Links to other unpublished ADRs are judged by the caller, who knows the base.
 * @param {string} path @param {string} text
 * @returns {string[]}
 */
export const unpublishedProblems = (path, text) => [
  ...(adrStatus(text) === 'Proposed' ? [] : [`${path} is not on the default branch yet and was changed: set its status back to Proposed; the engine asks for its ratification again`]),
  ...DRAFT_HISTORY.filter((key) => field(text, key) !== null).map((key) => `${path} is not on the default branch yet: drop ${key} and edit it in place`),
  ...(HISTORY_SECTION.test(text) ? [`${path} is not on the default branch yet: drop its history section; git keeps the drafts`] : []),
]

/**
 * Why an unpublished ADR may not link to another unpublished one.
 * @param {string} path @param {{ key: string, number: number }} link @param {string} target the linked ADR's path
 */
export const unpublishedLink = (path, { key, number }, target) =>
  `${path} ${key} ADR-${String(number).padStart(3, '0')}, which is not on the default branch yet: edit ${target} in place instead`
