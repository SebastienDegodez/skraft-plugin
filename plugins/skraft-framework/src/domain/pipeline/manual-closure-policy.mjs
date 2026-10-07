// Pure: a reviewed phase closed by human-validated reworks instead of a reviewer APPROVED
// (what skraft-orchestrator.md "Manual closure" did by hand). The closing review is
// rendered from this data with the review-verdict template, never written by hand.

// How many recent commits a manual DELIVER closure checks against `type(scope): subject`.
export const MANUAL_CLOSURE_COMMIT_SCAN = 20

export const manualClosePath = (date) => `reviews/${date}/manual-close.md`

const HUMAN_VALIDATION = ['human-validation']
const contribution = (weight) => Object.freeze({ answered_by: HUMAN_VALIDATION, weight, contribution: weight })

export const manualClosureReview = () => ({
  verdict: 'APPROVED',
  confidence: 'high',
  lenses: {
    'human-validation': {
      status: 'pass',
      findings: ['Closed after human-validated manual reworks; no reviewer sub-agent dispatched.'],
    },
  },
  synthesis: {
    questions: {
      completeness: contribution(0.30),
      'business-fit': contribution(0.30),
      quality: contribution(0.15),
      risk: contribution(0.25),
    },
    blocking_findings: [],
    recommendations: [],
    dissent: 'No reviewer sub-agent was dispatched.',
  },
})

// A phase the human can close by hand: one with a reviewer (RESEARCH closes itself), still open.
export const manualClosureRefusal = ({ phase, currentPhase, reviewer }) => {
  if (!currentPhase || currentPhase === 'DONE') return { code: 'PIPELINE_DONE', reason: 'the pipeline is DONE; nothing to close' }
  if (phase && phase !== currentPhase) return { code: 'PHASE_MISMATCH', reason: `${phase} is not the open phase (${currentPhase})` }
  if (!reviewer) return { code: 'NO_REVIEWER', reason: `${currentPhase} has no reviewer; the pipeline closes it itself` }
  return null
}
