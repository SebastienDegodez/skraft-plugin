/**
 * The verdict of a review, computed from its lens results and refutations; no agent decides
 * it. A refuted finding does not count; an unverifiable one does. Findings of different lenses
 * at the same line with the same severity are one reason, citing each lens.
 *   a lens that answered inconclusive                            BLOCKED, code lens-inconclusive
 *   a lens that failed with no blocker, high or medium finding   BLOCKED, code lens-inconclusive
 *   otherwise, a blocker, high or medium finding that counts      NEEDS_REWORK
 *   otherwise (low findings are notes)                           APPROVED
 * A BLOCKED review sends nothing back to the phase agent: no lens told it what to fix.
 *
 * @typedef {import('./answers.mjs').LensResult} LensResult
 * @typedef {import('./answers.mjs').Finding} Finding
 * @typedef {{ lens: string, finding: string, verdict: 'confirmed' | 'refuted' | 'unverifiable', reason: string }} RecordedRefutation
 * @typedef {{ status: 'APPROVED' | 'NEEDS_REWORK' | 'BLOCKED', code: 'lens-inconclusive' | null, reasons: string[], summary: string }} ReviewVerdict
 *   reasons: one line per finding that sends the work back, for the next brief, or per lens that
 *   blocks the review. A lens result's verdict (pass, fail, inconclusive) and a refutation's
 *   (confirmed, refuted, unverifiable) feed this status; the journal records it as the outcome
 *   approved, needs-rework or blocked, and a run with no NEEDS_REWORK edge stops with the code
 *   review-rejected.
 */

import { groupFindings } from './finding-groups.mjs'
import { emitYaml } from './yaml-emitter.mjs'

const BLOCKING = Object.freeze(['blocker', 'high', 'medium'])
/** The severities the refuter checks before they count. */
export const REFUTED_SEVERITIES = Object.freeze(['blocker', 'high'])

/**
 * Whether a lens left the review without a verdict it can act on, so that no finding needs a check.
 * @param {LensResult[]} results
 */
export const blocksReview = (results) => results.some((result) => inconclusiveLine(result) !== null)

/**
 * @param {LensResult[]} results in the node's lens order
 * @param {RecordedRefutation[]} refutations
 * @returns {ReviewVerdict}
 */
export const decideReview = (results, refutations) => {
  const blocking = results.map(inconclusiveLine).filter((line) => line !== null)
  if (blocking.length > 0) return { status: 'BLOCKED', code: 'lens-inconclusive', reasons: blocking, summary: blocking.join('; ') }
  const reasons = groupFindings(results.flatMap((result) => countedFindings(result, refutations))).map(groupLine)
  const status = reasons.length > 0 ? 'NEEDS_REWORK' : 'APPROVED'
  return { status, code: null, reasons, summary: summaryOf(status, results, reasons) }
}

/** Why a lens blocks the review, with what it noted; null when it does not. @param {LensResult} result */
const inconclusiveLine = ({ lens, verdict, findings }) => {
  if (verdict === 'inconclusive') return `${lens}: inconclusive${detailOf(findings)}`
  if (verdict === 'fail' && !findings.some((finding) => BLOCKING.includes(finding.severity))) return `${lens}: failed without naming a blocker, high or medium finding${detailOf(findings)}`
  return null
}

/**
 * @typedef {{ lens: string, finding: Finding, refutation: RecordedRefutation | undefined }} Counted
 *   a finding that counts, with the refuter's word on it
 */

/**
 * The blocker, high and medium findings of a lens that count: those the refuter did not refute.
 * @param {LensResult} result @param {RecordedRefutation[]} refutations
 * @returns {Counted[]}
 */
const countedFindings = ({ lens, findings }, refutations) => findings
  .filter((finding) => BLOCKING.includes(finding.severity))
  .map((finding) => ({ lens, finding, refutation: refutationOf(refutations, lens, finding.id) }))
  .filter(({ refutation }) => refutation?.verdict !== 'refuted')

/** @param {Finding[]} findings */
const detailOf = (findings) => (findings.length > 0 ? `: ${findings.map((finding) => finding.description).join('; ')}` : '')

/** @param {RecordedRefutation[]} refutations @param {string} lens @param {string} id */
const refutationOf = (refutations, lens, id) => refutations.find((refutation) => refutation.lens === lens && refutation.finding === id)

/**
 * A group of findings as the agent it goes back to reads it: every lens cited, the place and the
 * severity once, each description and suggestion; the refuter's word is the group's.
 * @param {Counted[]} members
 */
const groupLine = (members) => {
  const suggestions = members.flatMap(({ finding }) => (finding.suggestion === null ? [] : [finding.suggestion]))
  return [
    `${headOf(members)}: ${members.map(({ finding }) => finding.description).join('; ')}`,
    ...(suggestions.length === 0 ? [] : [` (suggestion: ${suggestions.join('; ')})`]),
    ...(members[0].refutation?.verdict === 'unverifiable' ? [' (not verified)'] : []),
  ].join('')
}

/** `<lens> <id> <gate>, … <severity> at <location>`, the place of the first. @param {Counted[]} members */
const headOf = (members) => {
  const { severity, location } = members[0].finding
  return `${members.map(({ lens, finding }) => `${lens} ${finding.id} ${finding.gate}`).join(', ')} ${severity}${location === '' ? '' : ` at ${location}`}`
}

/** @param {'APPROVED' | 'NEEDS_REWORK'} status @param {LensResult[]} results @param {string[]} reasons */
const summaryOf = (status, results, reasons) => {
  if (results.length === 0) return 'APPROVED: no lens applies to these changes'
  if (status === 'APPROVED') return `APPROVED: ${results.map((result) => result.lens).join(', ')} approve`
  return `NEEDS_REWORK: ${reasons.length} reason${reasons.length > 1 ? 's' : ''} to address`
}

/**
 * The verdict file of a review pass: its status, the findings that count, the low ones as notes,
 * every refutation, and the lenses taken over from the previous pass.
 * @param {{ verdict: ReviewVerdict, results: LensResult[], refutations: RecordedRefutation[], reused: string[] }} pass
 *   reused: the lenses whose result was kept from the previous pass, in the node's order
 */
export const composeVerdictFile = ({ verdict, results, refutations, reused }) => emitYaml({
  status: verdict.status,
  code: verdict.code,
  summary: verdict.summary,
  findings: results.flatMap((result) => countedFindings(result, refutations).map(({ lens, finding }) => findingEntry(lens, finding))),
  notes: results.flatMap(({ lens, findings }) => findings.filter((finding) => !BLOCKING.includes(finding.severity)).map((finding) => findingEntry(lens, finding))),
  refutations: refutations.map(({ lens, finding, verdict: said, reason }) => ({ lens, finding, verdict: said, reason })),
  reused: reused.map((lens) => ({ lens })),
})

/** @param {string} lens @param {Finding} finding */
const findingEntry = (lens, { id, gate, severity, location, description, suggestion }) => ({ lens, id, gate, severity, location, description, suggestion })
