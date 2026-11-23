import { REVIEW_STATUSES } from './run-facts.mjs'
import { cell, code, inert, oneLine } from './markdown-safety.mjs'
import { counted } from './pull-request-words.mjs'

/**
 * A review as a pull request description and a review comment show it: one table per review
 * step, one row per finding, grouped by status (to fix, to decide, accepted, note); the refuted rows in a
 * block that opens on a click below it, so the open part shows only what needs action. A claim
 * is cut at CLAIM_LENGTH characters with `…`, and so is the refuter's reason on a row to fix; a
 * row to decide and a refuted row, read to judge the refuter, give its reason whole.
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

/** The statuses a reviewer acts on or must see: to fix, to decide, accepted as it stands. */
const OPEN_STATUSES = Object.freeze(['fix', 'decide', 'accepted'])

/** Whether a line asks for an action or a human accepted it unfixed. @param {ReviewFacts} review */
export const asksAction = (review) => review.some((step) => step.lines.some(({ status }) => OPEN_STATUSES.includes(status)))

/**
 * The line that opens a review step: its name, how many passes it ran, what its lenses and its
 * refuter ran on, so that two runs compare.
 * @param {import('./run-facts.mjs').StepReview} review @param {Words} words
 */
export const stepHeading = ({ step, passes, lenses, refuter }, words) => `**${step}** · ${words.review.heading(counted(words, passes, words.review.passes), lenses, refuter)}`

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
  `| ${words.review.status[status]} | ${finding.severity} | ${cell(cited)} | ${cell(locationOf(finding.location))} | ${cell(shortened(finding.description))} | ${cell(whyOf({ status, finding }, words))} |`

/** Where the finding is, `-` for a finding that names no place. @param {string} location */
const locationOf = (location) => (location === '' ? '-' : code(location))

/**
 * What the row says of its status: why a note is one, that a human accepted it, else the
 * refuter's word and reason, which every other finding has.
 * @param {Pick<FindingLine, 'status' | 'finding'>} line @param {Words} words
 */
const whyOf = ({ status, finding }, words) => {
  if (status === 'note') return words.review.unchanged(/** @type {number} */ (finding.since))
  if (status === 'accepted') return words.review.accepted
  return refuterWord({ status, finding }, words)
}

/**
 * The refuter's word and reason on a finding it judged: its reason whole on what it refuted, cut
 * on what is to fix.
 * @param {Pick<FindingLine, 'status' | 'finding'>} line @param {Words} words
 */
const refuterWord = ({ status, finding }, words) => {
  const reason = (status === 'fix' ? shortened : whole)(/** @type {string} */ (finding.reason))
  if (status === 'decide') return `${words.review.alone}${reason}`
  if (status === 'refuted') return `${reason}${finding.carried === null ? '' : words.review.carried(finding.carried)}`
  return finding.verdict === 'unverifiable' ? `${words.review.unverifiable}${reason}` : `${words.review.confirmed}${reason}`
}

/** What the refuter wrote, on one line, whole, made inert. @param {string} text */
const whole = (text) => inert(oneLine(text))

/** What a lens or the refuter wrote, on one line, cut at CLAIM_LENGTH characters, made inert. @param {string} text */
const shortened = (text) => {
  const line = oneLine(text)
  return inert(line.length > CLAIM_LENGTH ? `${line.slice(0, CLAIM_LENGTH - 1).trimEnd()}…` : line)
}
