/**
 * What the body of an ADR written in this run must not hold: a version, an image tag or a package
 * pin. Versions live in the manifests; an ADR names the technology or the capability it brings.
 * Nor a code file, an acceptance criterion or a ticket: an ADR reads on its own.
 */

import { field, headerOf } from './adr.mjs'
import { citationProblems, withoutCodeFiles } from './adr-citations.mjs'

const PACKAGE_PIN = String.raw`[\w./-]+@[\^~]?\d[\w.]*`
// A name, then `:` and a tag with a digit. Not a tag: a port (3 to 5 digits alone, then no more of a
// version) and anything in a URL's authority (`//host:port`).
const IMAGE_TAG = String.raw`(?<!\/\/[^\s/]*)\b[A-Za-z][\w.-]*(?:\/[\w.-]+)*:(?!\d{3,5}(?![\w-]|\.\d))[\w-]*\d[\w-]*(?:\.[\w-]+)*`
const SEMVER = String.raw`\b\d+\.\d+\.\d+\b`
const BLOCK_INDICATOR = /^[>|][+-]?$/
const BLOCK_LINES = /^[^\n]*(?:\r?\n[ \t]+\S[^\n]*)*/
const SENTENCE_END = /(?<!\b(?:e\.g|i\.e|vs|etc|cf)\.)(?<=[.!?])\s+(?=[A-Z])/
const CODE_SPAN = /`[^`]*`/g
const PINS = new RegExp([PACKAGE_PIN, IMAGE_TAG, SEMVER].join('|'), 'g')
const OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1?\d?\d)`
/** An IPv4 address, which a semantic version would otherwise read. */
const ADDRESS = new RegExp(String.raw`\b${OCTET}(?:\.${OCTET}){3}\b`, 'g')
/** A calendar day written with dots, slashes or hyphens. */
const DAY = /\b(?:19|20)\d\d([./-])(?:0[1-9]|1[0-2])\1(?:0[1-9]|[12]\d|3[01])\b/g

/** The text after the YAML header; the whole text without one. @param {string} text */
const bodyOf = (text) => {
  const header = headerOf(text)
  return header === null ? text : text.slice(text.indexOf(header) + header.length)
}

/**
 * Each version pin of the body, once, in reading order; a code file's line, an address or a day is
 * no version.
 * @param {string} body
 */
const versionPins = (body) => [...new Set(withoutCodeFiles(body).replace(ADDRESS, ' ').replace(DAY, ' ').match(PINS) ?? [])]

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
  const prose = `${bodyOf(text)}\n${decisionOf(text)}`
  return [
    ...versionPins(prose).map((token) => `${path} names a version (${token}): name the technology or the capability it brings; versions live in the manifests`),
    ...citationProblems(path, prose),
    ...decisionProblems(path, text),
  ]
}

/** The lines an ADR on the default branch may change: its status and its replacement. */
const STATUS_LINES = /^(?:(?:status|superseded_by):|\*\*Status:\*\*).*\n?/gm

/** @param {string} text */
const withoutStatus = (text) => text.replace(/\r\n/g, '\n').replace(STATUS_LINES, '')

/**
 * The statuses an `Accepted` ADR on the default branch may move to, in its header and in its
 * `**Status:**` line; any other status stays as it is. The header may say `Superseded` alone, its
 * `superseded_by` naming the successor.
 */
const SUCCESSOR = String.raw`by \[?ADR-\d+\]?(?:\([^)]*\))?`
const ACCEPTED_MOVES = [new RegExp(`^(?:Deprecated|Superseded(?: ${SUCCESSOR})?)$`), new RegExp(`^(?:Deprecated|Superseded ${SUCCESSOR})$`)]

/**
 * The status the header and the `**Status:**` line declare, each in turn.
 * @param {string} text
 */
const declaredStatuses = (text) => [field(text, 'status'), STATUS_LINE.exec(text)?.[1]]

/**
 * Whether a status may go from `before` to `after`: an Accepted one to Superseded by ADR-NNN or
 * Deprecated, any other unchanged. A status outside the closed set is refused on its own.
 * @param {RegExp} moves @param {string | null | undefined} before @param {string | null | undefined} after
 */
const allowedMove = (moves, before, after) => after === before || !STATUS.test(after ?? '') || (before === 'Accepted' && moves.test(after ?? ''))

/**
 * Each status change of an ADR on the default branch that its lifecycle forbids, once.
 * @param {string} path @param {string} before @param {string} after
 */
const transitionProblems = (path, before, after) => {
  const was = declaredStatuses(before)
  const moves = declaredStatuses(after).map((status, at) => [was[at], status, ACCEPTED_MOVES[at]])
    .filter(([from, to, moves]) => !allowedMove(/** @type {RegExp} */ (moves), from, to))
  return [...new Set(moves.map(([from, to]) => `${path} is on the default branch with the status "${from}" and was given "${to}": an Accepted ADR becomes only Superseded by ADR-NNN or Deprecated; any other status stays`))]
}

/**
 * What an ADR on the default branch must not suffer: a change beyond its status lines, a status
 * move its lifecycle forbids, a deletion.
 * @param {string} path @param {string} before the text on the base @param {string | null} after null: deleted
 * @returns {string[]}
 */
export const publishedProblems = (path, before, after) => {
  if (after === null) return [`${path} is on the default branch and was deleted: restore it; an ADR is never deleted`]
  const kept = withoutStatus(before) === withoutStatus(after) ? [] : [`${path} is on the default branch: change only its status lines; write a new ADR that supersedes or amends it`]
  return [...kept, ...transitionProblems(path, before, after)]
}
