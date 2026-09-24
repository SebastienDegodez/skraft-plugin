import { Ok, Err } from './result.mjs'

// The field set of state.json. state.schema.json beside this module is its contract;
// tests/skraft-framework/state/state-schema-contract.acceptance.test.mjs fails when the
// schema and this descriptor list different fields or owners.
//
// owner:
//   'invariant'    — owned & normalized by the state machine (validatePipelineState).
//   'orchestrator' — written by the orchestrator, preserved verbatim on every CLI write.
export const STATE_SCHEMA = Object.freeze({
  projectSlug: Object.freeze({ owner: 'orchestrator' }),
  skraftPlanFile: Object.freeze({ owner: 'orchestrator' }),
  currentPhase: Object.freeze({ owner: 'invariant' }),
  entryMode: Object.freeze({ owner: 'orchestrator' }),
  issueNumber: Object.freeze({ owner: 'orchestrator' }),
  phasesCompleted: Object.freeze({ owner: 'invariant' }),
  phaseArtifacts: Object.freeze({ owner: 'invariant' }),
  verdicts: Object.freeze({ owner: 'invariant' }),
  reviewArtifacts: Object.freeze({ owner: 'invariant' }),
  retryCount: Object.freeze({ owner: 'invariant' }),
  reworkCount: Object.freeze({ owner: 'invariant' }),
  findingsResolved: Object.freeze({ owner: 'invariant' }),
  referencesProcessed: Object.freeze({ owner: 'orchestrator' }),
  phaseHistory: Object.freeze({ owner: 'orchestrator' }),
  nextActions: Object.freeze({ owner: 'orchestrator' }),
  userPreferences: Object.freeze({ owner: 'invariant' }),
  neighborPlanners: Object.freeze({ owner: 'orchestrator' }),
  adrRatification: Object.freeze({ owner: 'orchestrator' }),
})

// Canonical field set (all top-level keys of state.json).
export const STATE_FIELDS = Object.freeze(Object.keys(STATE_SCHEMA))

// Invariant-bearing subset owned & normalized by validatePipelineState below.
export const INVARIANT_FIELDS = Object.freeze(
  STATE_FIELDS.filter((field) => STATE_SCHEMA[field].owner === 'invariant')
)

// Pure intrinsic-shape validation of the recorded pipeline state. No IO, no config
// cross-checks (phase membership / agent resolvability belong to pipeline-policy, ADR-005).

// Dispatch projection of the recorded pipeline state, derived from the fields the
// state CLI actually writes (validatePipelineState below): the current phase, whether
// its specialist recorded an artefact, its verdict, and its retry budget.
export const projectDispatchState = (raw) => {
  const validated = validatePipelineState(raw)
  if (!validated.ok) return validated
  const state = validated.value
  const phase = state.currentPhase
  return Ok(Object.freeze({
    currentPhase: phase,
    specialistDone: (state.phaseArtifacts[phase] ?? []).length > 0,
    reviewerVerdict: state.verdicts[phase] ?? null,
    retries: state.retryCount[phase] ?? 0,
    maxRetries: state.userPreferences.maxRetriesPerPhase ?? 2,
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
// orchestrator depends on (adrRatification, issueNumber, projectSlug,
// skraftPlanFile, phaseHistory, neighborPlanners, nextActions, referencesProcessed,
// entryMode, ...) pass straight through instead of being silently
// dropped on rewrite. Missing optional invariant fields are coerced to safe defaults.
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

  const { difficulty: _obsoleteDifficulty, ...currentRaw } = raw
  const coerced = {
    ...currentRaw,
    currentPhase: raw.currentPhase,
    phasesCompleted: Array.isArray(raw.phasesCompleted) ? [...raw.phasesCompleted] : [],
    verdicts: (rawVerdicts && !Array.isArray(rawVerdicts) && typeof rawVerdicts === 'object')
      ? { ...rawVerdicts } : {},
    retryCount: (raw.retryCount && !Array.isArray(raw.retryCount) && typeof raw.retryCount === 'object')
      ? { ...raw.retryCount } : {},
    reworkCount: (raw.reworkCount && !Array.isArray(raw.reworkCount) && typeof raw.reworkCount === 'object')
      ? { ...raw.reworkCount } : {},
    findingsResolved: (raw.findingsResolved && !Array.isArray(raw.findingsResolved) && typeof raw.findingsResolved === 'object')
      ? { ...raw.findingsResolved } : {},
    phaseArtifacts: coercePhaseMap(raw.phaseArtifacts),
    reviewArtifacts: coercePhaseMap(raw.reviewArtifacts),
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
