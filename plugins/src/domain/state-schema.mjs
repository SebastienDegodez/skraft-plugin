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
// FIDELITY (round-trip): every field on the raw object is preserved. The state machine
// only owns the invariant-bearing subset normalized below; all other fields the
// orchestrator depends on (entryPoint, adrRatification, issueNumber, projectSlug,
// skraftPlanFile, phaseHistory, neighborPlanners, nextActions, referencesProcessed,
// depthTierOverrides, entryMode, ...) pass straight through instead of being silently
// dropped on rewrite. Missing optional invariant fields are coerced to safe defaults.
// Distinct from validateState() which validates the hook-dispatch runtime shape.
export const validatePipelineState = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Err({ code: 'INVALID_STATE', fields: ['state'], reason: 'pipeline state must be an object' })
  }
  if (typeof raw.currentPhase !== 'string' || raw.currentPhase.length === 0) {
    return Err({ code: 'INVALID_STATE', fields: ['currentPhase'], reason: 'currentPhase must be a non-empty string' })
  }

  // Legacy alias: hand-authored state.json used `reviewerVerdicts`; the canonical
  // field is `verdicts` (identical phase->verdict map shape). Adopt the legacy value
  // only when the canonical is absent, then drop the alias to avoid split-brain.
  const rawVerdicts = (raw.verdicts !== undefined) ? raw.verdicts : raw.reviewerVerdicts

  const coerced = {
    ...raw,
    currentPhase: raw.currentPhase,
    phasesCompleted: Array.isArray(raw.phasesCompleted) ? [...raw.phasesCompleted] : [],
    verdicts: (rawVerdicts && !Array.isArray(rawVerdicts) && typeof rawVerdicts === 'object')
      ? { ...rawVerdicts } : {},
    retryCount: (raw.retryCount && !Array.isArray(raw.retryCount) && typeof raw.retryCount === 'object')
      ? { ...raw.retryCount } : {},
    phaseArtifacts: coercePhaseMap(raw.phaseArtifacts),
    reviewArtifacts: coercePhaseMap(raw.reviewArtifacts),
    difficulty: (typeof raw.difficulty === 'string') ? raw.difficulty : null,
    userPreferences: (raw.userPreferences && typeof raw.userPreferences === 'object' && !Array.isArray(raw.userPreferences))
      ? { ...raw.userPreferences } : {},
  }

  // Legacy flat-array artifacts are preserved verbatim under a *Legacy key rather
  // than dropped; the phase-keyed map restarts empty for future appends.
  if (Array.isArray(raw.reviewArtifacts) && raw.reviewArtifacts.length > 0) {
    coerced.reviewArtifactsLegacy = [...raw.reviewArtifacts]
  }
  if (Array.isArray(raw.phaseArtifacts) && raw.phaseArtifacts.length > 0) {
    coerced.phaseArtifactsLegacy = [...raw.phaseArtifacts]
  }

  delete coerced.reviewerVerdicts

  return Ok(Object.freeze(coerced))
}
