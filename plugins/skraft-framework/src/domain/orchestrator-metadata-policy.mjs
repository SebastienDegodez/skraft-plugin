import { Ok, Err } from './result.mjs'
import { STATE_JSON_SCHEMA } from './state-schema.mjs'
import { schemaViolations } from './schema-validator.mjs'

// The orchestrator-owned state.json fields the state CLI writes through `set --field`.
// Invariant-bearing fields, projectSlug (written by init) and phaseHistory (written by
// mark-phase-started / phase closure) are not settable here. A value must match its
// field in state.schema.json, so a `set` never writes a state the reader would refuse.
export const SETTABLE_METADATA_FIELDS = Object.freeze([
  'adrRatification', 'nextActions', 'referencesProcessed', 'neighborPlanners', 'entryMode', 'issueNumber', 'skraftPlanFile',
])

export const validateMetadataField = (field, value) => {
  if (!SETTABLE_METADATA_FIELDS.includes(field)) {
    return Err({
      code: 'IMMUTABLE_FIELD',
      field,
      reason: `${field} is not settable; settable fields: ${SETTABLE_METADATA_FIELDS.join(', ')}`,
    })
  }
  const violations = schemaViolations(STATE_JSON_SCHEMA.properties[field], value, STATE_JSON_SCHEMA, field)
  if (violations.length > 0) {
    return Err({ code: 'INVALID_METADATA', field, reason: violations.map(({ reason }) => reason).join('; ') })
  }
  return Ok(value)
}
