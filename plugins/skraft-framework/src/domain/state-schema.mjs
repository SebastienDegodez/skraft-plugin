import { createRequire } from 'node:module'
import { Ok, Err } from './result.mjs'
import { schemaViolations } from './schema-validator.mjs'

// state.schema.json beside this module is the contract of state.json: the reader below
// enforces it, and STATE_SCHEMA takes the field set and owners from it. Loaded through
// require, which reads JSON on every supported Node version without a warning.
//
// owner (x-owner):
//   'invariant'    — owned by the state machine; an absent one reads as empty.
//   'orchestrator' — written by the orchestrator through state.mjs set or phase events.
export const STATE_JSON_SCHEMA = Object.freeze(createRequire(import.meta.url)('./state.schema.json'))

export const STATE_SCHEMA = Object.freeze(Object.fromEntries(
  Object.entries(STATE_JSON_SCHEMA.properties)
    .map(([field, schema]) => [field, Object.freeze({ owner: schema['x-owner'] })]),
))

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

// What an invariant field reads as while it is absent: nothing recorded yet.
const ABSENT_INVARIANTS = Object.freeze({
  phasesCompleted: [],
  phaseArtifacts: {},
  verdicts: {},
  reviewArtifacts: {},
  retryCount: {},
  reworkCount: {},
  findingsResolved: {},
  userPreferences: {},
})

const copyOf = (value) => (Array.isArray(value)
  ? [...value]
  : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Array.isArray(item) ? [...item] : item])))

// Validates the recorded state against state.schema.json. A field the schema does not
// declare, or a value outside its shape, is INVALID_STATE: no older format is migrated,
// and no value is coerced. Every field is preserved; absent invariant fields read as empty.
export const validatePipelineState = (raw) => {
  const violations = schemaViolations(STATE_JSON_SCHEMA, raw)
  if (violations.length > 0) {
    return Err({
      code: 'INVALID_STATE',
      fields: [...new Set(violations.map(({ path }) => path.split(/[.[]/)[0]))],
      reason: violations.map(({ reason }) => reason).join('; '),
    })
  }
  const invariants = Object.entries(ABSENT_INVARIANTS)
    .map(([field, empty]) => [field, copyOf(raw[field] ?? empty)])
  return Ok(Object.freeze({ ...raw, ...Object.fromEntries(invariants) }))
}
