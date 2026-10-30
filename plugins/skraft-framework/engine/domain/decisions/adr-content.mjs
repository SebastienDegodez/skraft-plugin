/**
 * What the body of an ADR written in this run must not hold: a version, an image tag or a package
 * pin. Versions live in the manifests; an ADR names the technology or the capability it brings.
 */

import { field, headerOf } from './adr.mjs'

const PACKAGE_PIN = String.raw`[\w./-]+@[\^~]?\d[\w.]*`
const IMAGE_TAG = String.raw`\b[A-Za-z][\w.-]*(?:\/[\w.-]+)*:[\w.-]*\d[\w.-]*`
const SEMVER = String.raw`\b\d+\.\d+\.\d+\b`
const MAJOR = String.raw`\b[vV]\d+(?:\.\d+)*\b`
const BLOCK_INDICATOR = /^[>|][+-]?$/
const BLOCK_LINES = /^[^\n]*(?:\r?\n[ \t]+\S[^\n]*)*/
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z])/
const PINS = new RegExp([PACKAGE_PIN, IMAGE_TAG, SEMVER, MAJOR].join('|'), 'g')

/** The text after the YAML header; the whole text without one. @param {string} text */
const bodyOf = (text) => {
  const header = headerOf(text)
  return header === null ? text : text.slice(text.indexOf(header) + header.length)
}

/**
 * Each version pin of the body, once, in reading order.
 * @param {string} body
 */
const versionPins = (body) => [...new Set(body.match(PINS) ?? [])]

/**
 * The header's `decision`: its value, or the indented lines of a folded or literal block; null or
 * empty when there is none.
 * @param {string} text
 */
const decisionOf = (text) => {
  const value = field(text, 'decision')
  // Stryker disable next-line ConditionalExpression,LogicalOperator: a null value fails the indicator test too, and is returned either way
  if (value === null || !BLOCK_INDICATOR.test(value)) return value
  const header = /** @type {string} */ (headerOf(text))
  const block = BLOCK_LINES.exec(header.slice(header.search(/^decision:/m)))
  return /** @type {RegExpExecArray} */ (block)[0].replace(/^[^\n]*/, '')
}

/** @param {string} path @param {string} text */
const decisionProblems = (path, text) => {
  const decision = decisionOf(text)
  if (!decision) return [`${path} has no decision in its header: state it in one sentence`]
  const count = decision.split(SENTENCE_END).length
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
export const contentProblems = (path, text) => [
  ...versionPins(bodyOf(text)).map((token) => `${path} names a version (${token}): name the technology or the capability it brings; versions live in the manifests`),
  ...decisionProblems(path, text),
]

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
