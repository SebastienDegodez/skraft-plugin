import { Ok, Err, isOk } from './result.mjs'
import { validatePipelineState } from './state-schema.mjs'
import { nextPhaseAfter } from './pipeline-policy.mjs'

// Default phase order — matches skraft-framework.config.json (no IO, derived constant).
const PHASE_ORDER = ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL', 'DELIVER']

// Pure domain state machine. No IO. No side effects.
// @param {object} currentState — raw state (will be validated+coerced)
// @param {object} event        — typed event (see contracts-state-transition-bridge.md)
// @returns {Result<FrozenState>}
export const applyTransition = (currentState, event) => {
  const validation = validatePipelineState(currentState)
  if (!isOk(validation)) {
    return Err({ code: 'INVALID_STATE', reason: validation.error.reason })
  }

  const state = validation.value

  // I8: DONE is terminal — all mutating events rejected
  if (state.currentPhase === 'DONE') {
    return Err({ code: 'TERMINAL_STATE', reason: 'pipeline is in terminal state DONE; no further transitions allowed' })
  }

  const maxRetries = state.userPreferences?.maxRetriesPerPhase ?? 2
  const phaseOrder = state.userPreferences?.phaseOrder ?? PHASE_ORDER

  switch (event.type) {
    case 'ADVANCE': {
      // I1: requires APPROVED verdict for current phase
      if (state.verdicts[state.currentPhase] !== 'APPROVED') {
        return Err({ code: 'VERDICT_NOT_APPROVED', reason: `verdict for ${state.currentPhase} must be APPROVED before advancing` })
      }
      // I2: target must equal nextPhaseAfter(current)
      const expectedNext = nextPhaseAfter(state.currentPhase, { phaseOrder }, []) ?? 'DONE'
      if (event.targetPhase !== expectedNext) {
        return Err({ code: 'ILLEGAL_PHASE_SKIP', reason: `expected ${expectedNext}, got ${event.targetPhase}` })
      }
      return Ok(Object.freeze({
        ...state,
        currentPhase: event.targetPhase,
        phasesCompleted: Object.freeze([...state.phasesCompleted, state.currentPhase]),
      }))
    }

    case 'RECORD_VERDICT': {
      return Ok(Object.freeze({
        ...state,
        verdicts: Object.freeze({ ...state.verdicts, [event.phase]: event.verdict }),
      }))
    }

    case 'RECORD_ARTIFACT': {
      // Test hook for I4 (phasesCompleted append-only) — unreachable via CLI (ADR Mandate 4 Gate a)
      if (event._testForcePhasesCompleted !== undefined) {
        if (event._testForcePhasesCompleted.length < state.phasesCompleted.length) {
          return Err({ code: 'APPEND_ONLY_VIOLATION', reason: 'phasesCompleted is append-only; replacement with fewer entries rejected' })
        }
      }
      // I5: phaseArtifacts[phase] is append-only
      const existingArtifacts = state.phaseArtifacts[event.phase] ?? []
      return Ok(Object.freeze({
        ...state,
        phaseArtifacts: Object.freeze({
          ...state.phaseArtifacts,
          [event.phase]: Object.freeze([...existingArtifacts, event.path]),
        }),
      }))
    }

    case 'RECORD_REVIEW_ARTIFACT': {
      // I6: reviewArtifacts[phase] is append-only
      const existingReview = state.reviewArtifacts[event.phase] ?? []
      // Test hook for I6 — unreachable via CLI (ADR Mandate 4 Gate a)
      if (event._testForceReviewArtifacts !== undefined) {
        if (event._testForceReviewArtifacts.length < existingReview.length) {
          return Err({ code: 'APPEND_ONLY_VIOLATION', reason: 'reviewArtifacts is append-only; replacement with fewer entries rejected' })
        }
      }
      return Ok(Object.freeze({
        ...state,
        reviewArtifacts: Object.freeze({
          ...state.reviewArtifacts,
          [event.phase]: Object.freeze([...existingReview, event.path]),
        }),
      }))
    }

    case 'CLOSE_PHASE': {
      // Composite: RECORD_VERDICT + (optional) RECORD_REVIEW_ARTIFACT + ADVANCE in one
      // atomic write — for manual closures (human-validated reworks, no reviewer sub-agent
      // verdict). event.phase must be the phase currently open; verdict must be APPROVED.
      if (event.phase !== state.currentPhase) {
        return Err({
          code: 'PHASE_MISMATCH',
          reason: `close-phase target ${event.phase} does not match currentPhase ${state.currentPhase}`,
        })
      }
      if (event.verdict !== 'APPROVED') {
        return Err({
          code: 'VERDICT_NOT_APPROVED',
          reason: `close-phase requires verdict APPROVED, got ${event.verdict}`,
        })
      }

      const existingReview = state.reviewArtifacts[event.phase] ?? []
      const reviewArtifacts = event.path
        ? Object.freeze({ ...state.reviewArtifacts, [event.phase]: Object.freeze([...existingReview, event.path]) })
        : state.reviewArtifacts

      const expectedNext = nextPhaseAfter(state.currentPhase, { phaseOrder }, []) ?? 'DONE'

      return Ok(Object.freeze({
        ...state,
        verdicts: Object.freeze({ ...state.verdicts, [event.phase]: event.verdict }),
        reviewArtifacts,
        currentPhase: expectedNext,
        phasesCompleted: Object.freeze([...state.phasesCompleted, state.currentPhase]),
      }))
    }

    case 'SET_DIFFICULTY': {
      // I7: write-once
      if (state.difficulty !== null) {
        return Err({ code: 'IMMUTABLE_FIELD', reason: 'difficulty is already set and cannot be changed' })
      }
      return Ok(Object.freeze({ ...state, difficulty: event.value }))
    }

    case 'INCR_RETRY': {
      // I3: capped at maxRetriesPerPhase
      const current = state.retryCount[event.phase] ?? 0
      if (current >= maxRetries) {
        return Err({ code: 'RETRY_EXHAUSTED', reason: `retry count for ${event.phase} has reached the limit of ${maxRetries}` })
      }
      return Ok(Object.freeze({
        ...state,
        retryCount: Object.freeze({ ...state.retryCount, [event.phase]: current + 1 }),
      }))
    }

    case 'RESOLVE_STALE': {
      // US13 recovery: a phase is stale when its retry budget is exhausted while the
      // verdict is not APPROVED — the pipeline can neither advance nor retry. Resetting
      // retryCount to 0 for that phase re-opens the rework loop so it can be relaunched.
      // Guarded so a non-stale phase's counter cannot be reset (retryCount stays capped).
      const phase = event.phase ?? state.currentPhase
      const current = state.retryCount[phase] ?? 0
      const verdict = state.verdicts[phase] ?? null
      if (current < maxRetries || verdict === 'APPROVED') {
        return Err({ code: 'NOT_STALE', reason: `phase ${phase} is not stale (retryCount ${current}, verdict ${verdict})` })
      }
      return Ok(Object.freeze({
        ...state,
        retryCount: Object.freeze({ ...state.retryCount, [phase]: 0 }),
      }))
    }

    default:
      return Err({ code: 'INVALID_STATE', reason: `unknown event type: ${event.type}` })
  }
}
