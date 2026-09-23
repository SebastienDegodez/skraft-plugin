import { Ok, Err, isOk } from './result.mjs'
import { validatePipelineState } from './state-schema.mjs'
import { nextPhaseAfter } from './pipeline-policy.mjs'
import { validateMetadataField } from './orchestrator-metadata-policy.mjs'

// Fallback phase order when the caller supplies none. The published order lives in
// skraft-framework.config.json::phaseOrder and is injected by the application layer.
export const DEFAULT_PHASE_ORDER = Object.freeze(['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])

// A closure given a time marks the closed phase done in phaseHistory.
const completedHistory = (state, phase, at) => {
  if (!at) return {}
  const entry = state.phaseHistory?.[phase] ?? {}
  return { phaseHistory: Object.freeze({ ...state.phaseHistory, [phase]: Object.freeze({ ...entry, status: 'done', completedAt: at }) }) }
}

// Pure domain state machine. No IO. No side effects.
// @param {object} currentState — raw state (will be validated+coerced)
// @param {object} event        — typed event (see contracts-state-transition-bridge.md)
// @param {object} context      — { phaseOrder } published by the framework config
// @returns {Result<FrozenState>}
export const applyTransition = (currentState, event, { phaseOrder: publishedOrder } = {}) => {
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
  const phaseOrder = state.userPreferences?.phaseOrder ?? publishedOrder ?? DEFAULT_PHASE_ORDER

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
        ...completedHistory(state, state.currentPhase, event.at),
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
        ...completedHistory(state, state.currentPhase, event.at),
      }))
    }

    case 'SET_METADATA': {
      const validated = validateMetadataField(event.field, event.value)
      if (!isOk(validated)) return validated
      return Ok(Object.freeze({ ...state, [event.field]: validated.value }))
    }

    case 'MARK_PHASE_STARTED': {
      if (event.phase !== state.currentPhase) {
        return Err({
          code: 'PHASE_MISMATCH',
          reason: `mark-phase-started target ${event.phase} does not match currentPhase ${state.currentPhase}`,
        })
      }
      // A retry re-dispatches the same phase: the first start and base commit stand.
      if (state.phaseHistory?.[event.phase]?.startedAt) return Ok(Object.freeze({ ...state }))
      return Ok(Object.freeze({
        ...state,
        phaseHistory: Object.freeze({
          ...state.phaseHistory,
          [event.phase]: Object.freeze({ status: 'inProgress', startedAt: event.at, baseSha: event.baseSha ?? null }),
        }),
      }))
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

    case 'INCR_REWORK': {
      // Manual rework pass (human-validated fix cycle outside the reviewer retry loop —
      // see rework-cost tracking, ADR-115). Not capped: rework passes are human-initiated
      // and deliberate, unlike automated retries. `findings` (default 1) accumulates the
      // count of findings resolved in this pass onto findingsResolved[phase].
      const currentRework = state.reworkCount[event.phase] ?? 0
      const currentFindings = state.findingsResolved[event.phase] ?? 0
      const resolvedThisPass = Number.isInteger(event.findings) && event.findings >= 0 ? event.findings : 1
      return Ok(Object.freeze({
        ...state,
        reworkCount: Object.freeze({ ...state.reworkCount, [event.phase]: currentRework + 1 }),
        findingsResolved: Object.freeze({ ...state.findingsResolved, [event.phase]: currentFindings + resolvedThisPass }),
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
