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
const MAJOR = String.raw`(?<!\/)\b[vV]\d+(?:\.\d+)*\b`
const BLOCK_INDICATOR = /^[>|][+-]?$/
const BLOCK_LINES = /^[^\n]*(?:\r?\n[ \t]+\S[^\n]*)*/
const SENTENCE_END = /(?<!\b(?:e\.g|i\.e|vs|etc|cf)\.)(?<=[.!?])\s+(?=[A-Z])/
const CODE_SPAN = /`[^`]*`/g
const PINS = new RegExp([PACKAGE_PIN, IMAGE_TAG, SEMVER, MAJOR].join('|'), 'g')
/** A path with a folder, or a file name with a line: what may name a file, its line or range kept, the full stop of its sentence left out. */
const FILE_CITE = /(?<=^|[\s,`'"(])(?:[\w.-]+(?:[\\/][\w.-]*[\w-])+|[\w.-]*[\w-](?=:\d))(?::\d+(?:[-\u2013]\d+)?)?/g
const FILE_NAME = /\.[A-Za-z]\w{0,9}$/
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
const withoutNonVersions = (body) => body.replace(FILE_CITE, (cite) => (isCodeFile(cite) ? ' ' : cite)).replace(ADDRESS, ' ').replace(DAY, ' ')

/**
 * Each file of the code the body names, once, in reading order, with forward slashes.
 * @param {string} body
 */
const codeFiles = (body) => [...new Set((body.match(FILE_CITE) ?? []).filter(isCodeFile).map((cite) => cite.replaceAll('\\', '/')))]

/** A cited path whose last part is a file name, and no document. @param {string} cite */
const isCodeFile = (cite) => {
  const path = cite.replace(/:[\d\u2013-]+$/, '').replaceAll('\\', '/')
  return FILE_NAME.test(path) && !DOCUMENT.test(path)
}

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
    ...codeFiles(content).map((file) => `${path} names a file of the code (${file}): name the component, the use case or the concept; files live in the research and the design`),
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
