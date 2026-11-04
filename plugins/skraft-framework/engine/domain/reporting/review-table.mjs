import { REVIEW_STATUSES } from './run-facts.mjs'
import { cell, code, inert, oneLine } from './markdown-safety.mjs'
import { counted } from './pull-request-words.mjs'

/**
 * A review as a pull request description and a review comment show it: one table per review
 * step, one row per finding, grouped by status (to fix, to decide, note); the refuted rows in a
 * block that opens on a click below it, so the open part shows only what needs action. A claim
 * and a reason are cut at CLAIM_LENGTH characters with `…`; verdict.yaml keeps them whole.
 *
 * @typedef {import('./run-facts.mjs').ReviewFacts} ReviewFacts
 * @typedef {import('./run-facts.mjs').FindingLine} FindingLine
 * @typedef {import('./run-facts.mjs').ReviewStatus} ReviewStatus
 * @typedef {import('./pull-request-words.mjs').Words} Words
 */

/** The longest claim or reason a row shows, `…` included. */
export const CLAIM_LENGTH = 100

/**
 * How many lines of each status the review holds, in plain words: `2 to fix, 13 refuted`; null
 * when it holds none.
 * @param {ReviewFacts} review @param {Words} words @returns {string | null}
 */
export const reviewCount = (review, words) => {
  const lines = review.flatMap((step) => step.lines)
  const parts = REVIEW_STATUSES.map((status) => countOf(lines, status, words)).filter((part) => part !== null)
  return parts.length === 0 ? null : parts.join(', ')
}

/** @param {FindingLine[]} lines @param {ReviewStatus} status @param {Words} words */
const countOf = (lines, status, words) => {
  const count = lines.filter((line) => line.status === status).length
  return count === 0 ? null : counted(words, count, words.review.counted[status])
}

/** Whether a line asks for an action: one to fix or to decide. @param {ReviewFacts} review */
export const asksAction = (review) => review.some((step) => step.lines.some(({ status }) => status === 'fix' || status === 'decide'))

/**
 * The table of a step's lines, then its refuted lines folded under their count.
 * @param {FindingLine[]} lines @param {Words} words @returns {string[]}
 */
export const stepTable = (lines, words) => {
  const open = lines.filter(({ status }) => status !== 'refuted')
  const refuted = lines.filter(({ status }) => status === 'refuted')
  return [
    ...(open.length === 0 ? [] : tableOf(open, words)),
    ...(open.length === 0 || refuted.length === 0 ? [] : ['']),
    ...(refuted.length === 0 ? [] : foldedRefuted(refuted, words)),
  ]
}

/** @param {FindingLine[]} refuted @param {Words} words */
const foldedRefuted = (refuted, words) => [
  `<details><summary>${counted(words, refuted.length, words.review.counted.refuted)}</summary>`, '', ...tableOf(refuted, words), '', '</details>',
]

/** @param {FindingLine[]} lines @param {Words} words */
const tableOf = (lines, words) => [words.review.header, '| --- | --- | --- | --- | --- | --- |', ...lines.map((line) => rowOf(line, words))]

/** @param {FindingLine} line @param {Words} words */
const rowOf = ({ status, cited, finding }, words) =>
  `| ${words.review.status[status]} | ${finding.severity} | ${cell(cited)} | ${cell(code(finding.location))} | ${cell(shortened(finding.description))} | ${cell(whyOf({ status, finding }, words))} |`

/**
 * What the row says of its status: why a note is one, else the refuter's word and reason, which
 * every finding but a note has.
 * @param {Pick<FindingLine, 'status' | 'finding'>} line @param {Words} words
 */
const whyOf = ({ status, finding }, words) => {
  if (status === 'note') return finding.since === null ? '' : words.review.unchanged(finding.since)
  const reason = shortened(/** @type {string} */ (finding.reason))
  if (status === 'decide') return `${words.review.alone}${reason}`
  if (status === 'refuted') return `${reason}${finding.carried === null ? '' : words.review.carried(finding.carried)}`
  return finding.verdict === 'unverifiable' ? `${words.review.unverifiable}${reason}` : `${words.review.confirmed}${reason}`
}

/** What a lens or the refuter wrote, on one line, cut at CLAIM_LENGTH characters, made inert. @param {string} text */
const shortened = (text) => {
  const line = oneLine(text)
  return inert(line.length > CLAIM_LENGTH ? `${line.slice(0, CLAIM_LENGTH - 1).trimEnd()}…` : line)
}
