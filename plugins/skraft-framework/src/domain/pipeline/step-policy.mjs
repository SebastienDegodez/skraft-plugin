import { reworkAddendum, ENVIRONMENT_REGATE_ADDENDUM } from './dispatch-brief.mjs'

// Pure: what the pipeline does next inside one phase. The use case (run-pipeline) runs
// the step; this module decides it. A step is one of:
//   { kind: 'specialist', addenda }   dispatch the phase specialist
//   { kind: 'reviewer' }              dispatch the phase reviewer
//   { kind: 'advance' }               close the phase (ADR ratification first for DESIGN)
//   { kind: 'retry', findings }       spend one retry, then the specialist reworks
//   { kind: 'environment', detail, source } ask the human to fix the environment
//   { kind: 'rejected', findings }    ask the human: rework or stop

export const specialist = (addenda = []) => Object.freeze({ kind: 'specialist', addenda })
export const REVIEWER = Object.freeze({ kind: 'reviewer' })
export const ADVANCE = Object.freeze({ kind: 'advance' })
export const retry = (findings) => Object.freeze({ kind: 'retry', findings })
export const environment = (detail, source = 'review') => Object.freeze({ kind: 'environment', detail, source })
export const rejected = (findings) => Object.freeze({ kind: 'rejected', findings })

// The specialist's next pass after a spent retry: the findings, verbatim.
export const reworkStep = ({ findings, attempt, maxAttempts }) =>
  specialist(findings ? [reworkAddendum({ attempt, maxAttempts, findings })] : [])

// Where a phase (re)starts, from its recorded verdict and its latest review.
//   attempt / maxAttempts — the next attempt, for the rework addendum.
export const stepOnEntry = ({ verdict, lastReview, attempt, maxAttempts }) => {
  if (verdict === 'APPROVED') return ADVANCE
  if (verdict !== 'CHANGES_REQUESTED') return specialist()
  if (lastReview?.verdict === 'REJECTED') return rejected(lastReview.findings)
  if (lastReview?.escalation === 'environment') return environment(lastReview.findings)
  return reworkStep({ findings: lastReview?.findings, attempt, maxAttempts })
}

// After the reviewer wrote its review. stateVerdict is what state.json records.
// A review with no parseable verdict yields step null: the phase is blocked.
export const stepAfterReview = (outcome) => {
  switch (outcome.verdict) {
    case 'APPROVED':
      return Object.freeze({ stateVerdict: 'APPROVED', step: ADVANCE })
    case 'NEEDS_REWORK':
      return Object.freeze({
        stateVerdict: 'CHANGES_REQUESTED',
        step: outcome.escalation === 'environment' ? environment(outcome.findings) : retry(outcome.findings),
      })
    case 'REJECTED':
      return Object.freeze({ stateVerdict: 'CHANGES_REQUESTED', step: rejected(outcome.findings) })
    default:
      return Object.freeze({ stateVerdict: null, step: null })
  }
}

// After the specialist left fewer outputs than required: a rework without a review.
export const stepAfterMissingOutputs = (missing) =>
  retry(`Artefact missing: ${missing.join(', ')}. Write every required output at its dated path.`)

// After the quality-gate verification of DELIVER. null: the gates passed, go on to review.
export const stepAfterQualityGates = ({ outcome, findings }) => {
  if (outcome === 'pass') return null
  if (outcome === 'fail') return retry(`qg-verify failed — fix these before review:\n${findings}`)
  return environment(findings, 'qg-verify')
}

// Once the human says the environment is fixed: DELIVER re-runs only the inconclusive
// gates; DESIGN and DISTILL ask the reviewer again.
export const stepAfterEnvironmentFixed = (phase) =>
  phase === 'DELIVER' ? specialist([ENVIRONMENT_REGATE_ADDENDUM]) : REVIEWER

// The human's answer to a rejected phase.
export const stepAfterRejection = (answer, findings) =>
  String(answer).trim().toLowerCase() === 'rework' ? retry(findings) : null

// Checkpoint keys: stable across a resume, distinct for each occurrence.
export const checkpointKeys = Object.freeze({
  rejected: (phase, recordedReviews) => `rejected:${phase}:${recordedReviews}`,
  environment: (phase, { source, recordedReviews, retries, occurrence }) =>
    `environment:${phase}:${source}:r${recordedReviews}:t${retries}:n${occurrence}`,
  adrRatification: (pending) => `adr-ratification:${pending.map(({ adr }) => adr).join(',')}`,
})
