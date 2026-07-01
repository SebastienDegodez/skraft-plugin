import { Ok, Err } from './result.mjs'

// Pure intrinsic-shape validation of the recorded pipeline state. No IO, no config
// cross-checks (phase membership / agent resolvability belong to pipeline-policy, ADR-005).

const VERDICTS = new Set(['APPROVED', 'CHANGES_REQUESTED', null])

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0
const isBoolean = (value) => typeof value === 'boolean'
const isKnownVerdict = (value) => VERDICTS.has(value)
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string')

export const validateState = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Err({ code: 'INVALID_STATE', fields: ['state'], reason: 'recorded pipeline state must be an object' })
  }

  const fields = []
  if (!isNonEmptyString(raw.currentPhase)) fields.push('currentPhase')
  if (!isBoolean(raw.specialistDone)) fields.push('specialistDone')
  if (!isKnownVerdict(raw.reviewerVerdict)) fields.push('reviewerVerdict')
  if (!isNonNegativeInteger(raw.retries)) fields.push('retries')
  if (!isStringArray(raw.skipPhases)) fields.push('skipPhases')

  if (fields.length > 0) {
    return Err({ code: 'INVALID_STATE', fields, reason: `recorded pipeline state is invalid in field(s): ${fields.join(', ')}` })
  }

  return Ok(Object.freeze({
    currentPhase: raw.currentPhase,
    specialistDone: raw.specialistDone,
    reviewerVerdict: raw.reviewerVerdict,
    retries: raw.retries,
    skipPhases: Object.freeze([...raw.skipPhases])
  }))
}

// Coerces a phase-keyed map: arrays → {}, objects with array values → deep copy
const coercePhaseMap = (val) => {
  if (!val || Array.isArray(val) || typeof val !== 'object') return {}
  return Object.fromEntries(
    Object.entries(val).map(([k, v]) => [k, Array.isArray(v) ? [...v] : []])
  )
}

// Validates (and coerces) the full orchestrator state.json shape used by the pipeline.
// Missing optional fields are coerced to safe defaults (backward-compatible, ADR-010).
// Distinct from validateState() which validates the hook-dispatch runtime shape.
export const validatePipelineState = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Err({ code: 'INVALID_STATE', fields: ['state'], reason: 'pipeline state must be an object' })
  }
  if (typeof raw.currentPhase !== 'string' || raw.currentPhase.length === 0) {
    return Err({ code: 'INVALID_STATE', fields: ['currentPhase'], reason: 'currentPhase must be a non-empty string' })
  }

  const coerced = {
    currentPhase: raw.currentPhase,
    phasesCompleted: Array.isArray(raw.phasesCompleted) ? [...raw.phasesCompleted] : [],
    verdicts: (raw.verdicts && !Array.isArray(raw.verdicts) && typeof raw.verdicts === 'object')
      ? { ...raw.verdicts } : {},
    retryCount: (raw.retryCount && !Array.isArray(raw.retryCount) && typeof raw.retryCount === 'object')
      ? { ...raw.retryCount } : {},
    phaseArtifacts: coercePhaseMap(raw.phaseArtifacts),
    reviewArtifacts: coercePhaseMap(raw.reviewArtifacts),
    difficulty: (typeof raw.difficulty === 'string') ? raw.difficulty : null,
    userPreferences: (raw.userPreferences && typeof raw.userPreferences === 'object' && !Array.isArray(raw.userPreferences))
      ? { ...raw.userPreferences } : {},
  }

  return Ok(Object.freeze(coerced))
}
