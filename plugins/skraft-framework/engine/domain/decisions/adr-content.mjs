/**
 * What the body of an ADR written in this run must not hold: a version, an image tag or a package
 * pin, and a file of the code. Versions live in the manifests, files in the research; an ADR names
 * the technology, the capability it brings, the component or the concept.
 */

import { field, headerOf } from './adr.mjs'

const PACKAGE_PIN = String.raw`[\w./-]+@[\^~]?\d[\w.]*`
// A name, then `:` and a tag with a digit. Not a tag: a port (2 to 5 digits alone, then no more of a
// version) and anything in a URL's authority (`//host:port`).
const IMAGE_TAG = String.raw`(?<!\/\/[^\s/]*)\b[A-Za-z][\w.-]*(?:\/[\w.-]+)*:(?!\d{2,5}(?![\w-]|\.\d))[\w-]*\d[\w-]*(?:\.[\w-]+)*`
const SEMVER = String.raw`\b\d+\.\d+\.\d+\b`
const BLOCK_INDICATOR = /^[>|][+-]?$/
const BLOCK_LINES = /^[^\n]*(?:\r?\n[ \t]+\S[^\n]*)*/
const SENTENCE_END = /(?<!\b(?:e\.g|i\.e|vs|etc|cf)\.)(?<=[.!?])\s+(?=[A-Z])/
const CODE_SPAN = /`[^`]*`/g
const PINS = new RegExp([PACKAGE_PIN, IMAGE_TAG, SEMVER].join('|'), 'g')
/** A word or a path, its line or range kept, the full stop of its sentence left out. */
const FILE_CITE = /(?<=^|[\s,`'"(])[\w.-]*[\w-](?:[\\/][\w.-]*[\w-])*(?::\d+(?:[-–]\d+)?)?/g
const LINE = /:[\d–-]+$/
const FILE_NAME = /\.[A-Za-z]\w{0,9}$/
const CODE = /\.(?:cs|fs|vb|java|kts?|scala|groovy|py|rb|go|rs|tsx?|jsx|[cm]?js|php|swift|c|h|cpp|hpp|sh|ps1)$/i
/** A technology named like a file (`Node.js`, `Next.js`): a file of the code only with a folder or a line. */
const TECHNOLOGY = /\.js$/i
/** The documents DESIGN keeps, and any Markdown page such as a linked ADR: an ADR may point at them. */
const DOCUMENT = /^docs\/|\.md$/i
const OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1?\d?\d)`
const ADDRESS = new RegExp(String.raw`\b${OCTET}(?:\.${OCTET}){3}\b`, 'g')
const DAY = /\b(?:19|20)\d\d([./-])(?:0[1-9]|1[0-2])\1(?:0[1-9]|[12]\d|3[01])\b/g

/** The text after the YAML header; the whole text without one. @param {string} text */
const bodyOf = (text) => {
  const header = headerOf(text)
  return header === null ? text : text.slice(text.indexOf(header) + header.length)
}

/**
 * Each version pin of the body, once, in reading order; a file it names, an address or a day is
 * none.
 * @param {string} body
 */
const versionPins = (body) => [...new Set(withoutNonVersions(body).match(PINS) ?? [])]

/** @param {string} body */
const withoutNonVersions = (body) => body.replace(FILE_CITE, (cite) => (kindOf(cite) === null ? cite : ' ')).replace(ADDRESS, ' ').replace(DAY, ' ')

/**
 * Each path and each file of the code the body names, once, in reading order, with forward slashes.
 * @param {string} body
 * @returns {Array<{ cite: string, kind: 'path' | 'code' }>}
 */
const filesNamed = (body) => [...new Set((body.match(FILE_CITE) ?? []).map((cite) => cite.replaceAll('\\', '/')))]
  .map((cite) => ({ cite, kind: kindOf(cite) }))
  .filter((named) => named.kind !== null)

/**
 * A path with a folder to a file, or the name of a file of the code; null for a document, a
 * configuration file named alone, a word.
 * @param {string} cite
 * @returns {'path' | 'code' | null}
 */
const kindOf = (cite) => {
  const file = cite.replace(LINE, '').replaceAll('\\', '/')
  if (!FILE_NAME.test(file) || DOCUMENT.test(file)) return null
  if (file.includes('/')) return 'path'
  return CODE.test(file) && (LINE.test(cite) || !TECHNOLOGY.test(file)) ? 'code' : null
}

const FILE_REASON = Object.freeze({
  path: 'name the component or the concept, and a configuration file by its name alone',
  code: 'name the component, the use case or the concept',
})

/** @param {{ cite: string, kind: 'path' | 'code' }} named */
const fileLabel = ({ cite, kind }) => `${kind === 'path' ? 'a path' : 'a file of the code'} (${cite}): ${FILE_REASON[kind]}`

/**
 * The header's `decision`: its value, or the indented lines of a folded or literal block; null or
 * empty when there is none.
 * @param {string} text
 */
const decisionOf = (text) => {
  const value = field(text, 'decision')
  // Stryker disable next-line ConditionalExpression: tested as true, the guard is killed; as false, the indicator test of "null" fails and the null is returned the same
  if (value === null) return value
  if (!BLOCK_INDICATOR.test(value)) return value
  const header = /** @type {string} */ (headerOf(text))
  const block = BLOCK_LINES.exec(header.slice(header.search(/^decision:/m)))
  return /** @type {RegExpExecArray} */ (block)[0].replace(/^[^\n]*/, '')
}

/** @param {string} path @param {string} text */
const decisionProblems = (path, text) => {
  const decision = decisionOf(text)
  if (!decision) return [`${path} has no decision in its header: state it in one sentence`]
  const count = decision.replace(CODE_SPAN, 'code').split(SENTENCE_END).length
  return count === 1 ? [] : [`${path} states its decision in ${count} sentences: keep one sentence and give each independent decision its own ADR`]
}

/**
 * The statuses an ADR may declare, in its header and in its `**Status:**` line, whole and in English.
 */
const STATUS = /^(?:Proposed|Accepted|Rejected|Deprecated|Superseded(?: by \[?ADR-\d+\]?(?:\([^)]*\))?)?)$/
const STATUS_LINE = /^\*\*Status:\*\*[ \t]*(.*?)[ \t]*$/m

/**
 * Each status the ADR declares that is outside the closed set, once.
 * @param {string} path @param {string} text
 * @returns {string[]}
 */
export const statusProblems = (path, text) => {
  const declared = [field(text, 'status'), STATUS_LINE.exec(text)?.[1]]
  return [...new Set(declared)]
    .filter((value) => typeof value === 'string' && !STATUS.test(value))
    .map((value) => `${path} has the status "${value}": use Proposed, Accepted, Rejected, Deprecated or Superseded by ADR-NNN; a partial replacement is a new ADR that amends it`)
}

/**
 * What the content of an unpublished ADR breaks.
 * @param {string} path @param {string} text
 * @returns {string[]}
 */
export const contentProblems = (path, text) => {
  const content = `${bodyOf(text)}\n${decisionOf(text) ?? ''}`
  return [
    ...filesNamed(content).map((named) => `${path} names ${fileLabel(named)}`),
    ...versionPins(content).map((token) => `${path} names a version (${token}): name the technology or the capability it brings; versions live in the manifests`),
    ...decisionProblems(path, text),
  ]
}

/** The lines an ADR on the default branch may change: its status and its replacement. */
const STATUS_LINES = /^(?:(?:status|superseded_by):|\*\*Status:\*\*).*\n?/gm

/** @param {string} text */
const withoutStatus = (text) => text.replace(/\r\n/g, '\n').replace(STATUS_LINES, '')

/**
 * What an ADR on the default branch must not suffer: a change beyond its status lines, a deletion.
 * @param {string} path @param {string} before the text on the base @param {string | null} after null: deleted
 * @returns {string[]}
 */
export const publishedProblems = (path, before, after) => {
  if (after === null) return [`${path} is on the default branch and was deleted: restore it; an ADR is never deleted`]
  return withoutStatus(before) === withoutStatus(after) ? [] : [`${path} is on the default branch: change only its status lines; write a new ADR that supersedes or amends it`]
}
