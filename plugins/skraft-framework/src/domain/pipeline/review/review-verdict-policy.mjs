// Pure: the verdict of a review from its lens results, the severity matrix of
// software-engineer-reviewer.md "Phase 4: SYNTHESIZE + VERDICT" as code. First row wins:
//   ≥1 blocker in any lens                     NEEDS_REWORK
//   ≥1 lens inconclusive                       NEEDS_REWORK
//   ≥1 high                                    NEEDS_REWORK
//   medium only                                NEEDS_REWORK
//   a lens `fail` with no such defect          NEEDS_REWORK (approval needs every lens's pass)
//   low only, or every lens pass               APPROVED
// Environment escalation: NEEDS_REWORK whose every reason is an inconclusive lens that
// reports only low `environment:` defects (the cause is the environment, not the code),
// with no blocker, high or medium defect anywhere.

const ENVIRONMENT = /^environment:/i
const BLOCKING = new Set(['blocker', 'high', 'medium'])

const count = (results, severity) => results.reduce(
  (total, { defects }) => total + defects.filter((defect) => defect.severity === severity).length, 0)

const environmentOnly = (result) =>
  result.defects.length > 0 && result.defects.every((defect) => defect.severity === 'low' && ENVIRONMENT.test(defect.description))

const describe = (result) => {
  const tally = ['blocker', 'high', 'medium', 'low']
    .map((severity) => [severity, result.defects.filter((defect) => defect.severity === severity).length])
    .filter(([, n]) => n > 0)
    .map(([severity, n]) => `${n} ${severity}`)
  return `${result.lens} ${result.verdict}${tally.length > 0 ? ` (${tally.join(', ')})` : ''}`
}

// A lens objects when it does not pass, or when it passes yet reports a defect that blocks.
const objects = ({ verdict, defects }) => verdict !== 'pass' || defects.some((defect) => BLOCKING.has(defect.severity))

// lensResults — [{ lens, verdict, defects[] }]. Returns { status, escalation, summary, dissent }.
export const decideReview = (lensResults) => {
  const results = [...lensResults]
  const inconclusive = results.filter((result) => result.verdict === 'inconclusive')
  const blocking = results.some(({ verdict, defects }) => verdict === 'fail' || defects.some((defect) => BLOCKING.has(defect.severity)))
  const status = results.length > 0 && inconclusive.length === 0 && !blocking ? 'APPROVED' : 'NEEDS_REWORK'
  const escalation = status === 'NEEDS_REWORK' && !blocking && inconclusive.length > 0 && inconclusive.every(environmentOnly)
    ? 'environment'
    : null

  const objecting = results.filter(objects)
  const agreeing = results.filter((result) => !objects(result))
  const dissent = objecting.length > 0 && agreeing.length > 0
    ? `${objecting.length <= agreeing.length ? 'Minority upheld' : 'Majority objects'}: ${objecting.map(describe).join('; ')}. ${agreeing.map(({ lens }) => lens).join(', ')} passed; the severity matrix keeps every blocker, high and medium defect and every inconclusive lens, whatever the count.`
    : 'no dissent'

  const reason = results.length === 0
    ? 'no lens ran'
    : status === 'APPROVED'
      ? `${results.length} lenses pass${count(results, 'low') > 0 ? `, ${count(results, 'low')} low defect(s) left as notes` : ''}`
      : objecting.map(describe).join('; ')
  const summary = `${status}${escalation ? ' (environment)' : ''}: ${reason}.`
  return Object.freeze({ status, escalation, summary, dissent })
}

// The review-verdict artifact data (artifact-registry 'review-verdict') of a code review.
export const codeReviewData = ({ lensResults, decision, reviewedSha }) => ({
  status: decision.status,
  lens_results: lensResults.map(({ lens, verdict, defects }) => ({ lens, verdict, defects: defects.map((defect) => ({ ...defect })) })),
  dissent_analysis: decision.dissent,
  summary: decision.summary,
  ...(reviewedSha ? { reviewed_sha: reviewedSha } : {}),
  ...(decision.escalation ? { escalation: decision.escalation } : {}),
})
