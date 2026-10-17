/**
 * The verdict of a review, computed from its lens results and refutations; no agent decides
 * it. A refuted finding does not count; an unverifiable one does.
 *   a blocker, high or medium finding that counts   NEEDS_REWORK
 *   a lens that answered inconclusive                NEEDS_REWORK
 *   a lens that failed without naming a finding      NEEDS_REWORK
 *   otherwise (low findings are notes)               APPROVED
 *
 * @typedef {import('./answers.mjs').LensResult} LensResult
 * @typedef {import('./answers.mjs').Finding} Finding
 * @typedef {{ lens: string, finding: string, verdict: 'confirmed' | 'refuted' | 'unverifiable', reason: string }} RecordedRefutation
 * @typedef {{ status: 'APPROVED' | 'NEEDS_REWORK', reasons: string[], summary: string }} ReviewVerdict
 *   reasons: one line per finding or lens that sends the work back, for the next brief.
 */

const BLOCKING = Object.freeze(['blocker', 'high', 'medium'])
/** The severities the refuter checks before they count. */
export const REFUTED_SEVERITIES = Object.freeze(['blocker', 'high'])

/**
 * @param {LensResult[]} results in the node's lens order
 * @param {RecordedRefutation[]} refutations
 * @returns {ReviewVerdict}
 */
export const decideReview = (results, refutations) => {
  const reasons = results.flatMap((result) => lensReasons(result, refutations))
  const status = reasons.length > 0 ? 'NEEDS_REWORK' : 'APPROVED'
  return { status, reasons, summary: summaryOf(status, results, reasons) }
}

/** @param {LensResult} result @param {RecordedRefutation[]} refutations */
const lensReasons = (result, refutations) => {
  if (result.verdict === 'inconclusive') return [`${result.lens}: inconclusive${detailOf(result.findings)}`]
  if (result.verdict === 'fail' && result.findings.length === 0) return [`${result.lens}: failed without naming a finding`]
  return result.findings
    .filter((finding) => BLOCKING.includes(finding.severity))
    .map((finding) => ({ finding, refutation: refutationOf(refutations, result.lens, finding.id) }))
    .filter(({ refutation }) => refutation?.verdict !== 'refuted')
    .map(({ finding, refutation }) => findingLine(result.lens, finding, refutation))
}

/** @param {Finding[]} findings */
const detailOf = (findings) => (findings.length > 0 ? `: ${findings.map((finding) => finding.description).join('; ')}` : '')

/** @param {RecordedRefutation[]} refutations @param {string} lens @param {string} id */
const refutationOf = (refutations, lens, id) => refutations.find((refutation) => refutation.lens === lens && refutation.finding === id)

/**
 * A finding as the agent it goes back to reads it.
 * @param {string} lens @param {Finding} finding @param {RecordedRefutation | undefined} refutation
 */
const findingLine = (lens, { id, severity, location, description, suggestion }, refutation) => [
  `${lens} ${id} ${severity}${location === '' ? '' : ` at ${location}`}: ${description}`,
  ...(suggestion === null ? [] : [` (suggestion: ${suggestion})`]),
  ...(refutation?.verdict === 'unverifiable' ? [' (not verified)'] : []),
].join('')

/** @param {ReviewVerdict['status']} status @param {LensResult[]} results @param {string[]} reasons */
const summaryOf = (status, results, reasons) => {
  if (results.length === 0) return 'APPROVED: no lens applies to these changes'
  if (status === 'APPROVED') return `APPROVED: ${results.map((result) => result.lens).join(', ')} approve`
  return `NEEDS_REWORK: ${reasons.length} finding${reasons.length > 1 ? 's' : ''} to address`
}
