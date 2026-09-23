import { Ok, Err } from './result.mjs'

// Pure validation of the orchestrator-owned state.json fields the state CLI writes
// through `set --field`. Invariant-bearing fields, projectSlug (written by init) and
// phaseHistory (written by mark-phase-started / phase closure) are not settable here.

const RATIFICATION_STATUSES = new Set(['none', 'awaiting_human', 'resolved', null])
const ENTRY_MODES = new Set(['capture', 'from-issue', 'from-prd', null])

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0)
const isObjectList = (value) => Array.isArray(value) && value.every(isPlainObject)
const isNullableString = (value) => value === null || (typeof value === 'string' && value.length > 0)

const invalid = (field, reason) => Err({ code: 'INVALID_METADATA', field, reason: `${field}: ${reason}` })

const VALIDATORS = {
  adrRatification: (value) => {
    if (!isPlainObject(value)) return 'must be an object'
    if (!RATIFICATION_STATUSES.has(value.checkpointStatus ?? null)) return 'checkpointStatus must be none, awaiting_human or resolved'
    if (!isObjectList(value.pending)) return 'pending must be a list of ADR rows'
    if (!isObjectList(value.ratified)) return 'ratified must be a list of ADR verdicts'
    return null
  },
  nextActions: (value) => (isStringList(value) ? null : 'must be a list of strings'),
  referencesProcessed: (value) => (isStringList(value) ? null : 'must be a list of file paths'),
  neighborPlanners: (value) => {
    if (!isPlainObject(value)) return 'must be an object'
    for (const key of ['securityPlanFile', 'raiPlanFile', 'ssscPlanFile']) {
      if (!isNullableString(value[key] ?? null)) return `${key} must be a path or null`
    }
    return null
  },
  entryMode: (value) => (ENTRY_MODES.has(value) ? null : 'must be capture, from-issue, from-prd or null'),
  issueNumber: (value) => (value === null || (Number.isInteger(value) && value > 0) ? null : 'must be a positive integer or null'),
  skraftPlanFile: (value) => (isNullableString(value) ? null : 'must be a relative path or null'),
}

export const SETTABLE_METADATA_FIELDS = Object.freeze(Object.keys(VALIDATORS))

export const validateMetadataField = (field, value) => {
  const validator = VALIDATORS[field]
  if (!validator) {
    return Err({
      code: 'IMMUTABLE_FIELD',
      field,
      reason: `${field} is not settable; settable fields: ${SETTABLE_METADATA_FIELDS.join(', ')}`,
    })
  }
  const problem = validator(value)
  return problem ? invalid(field, problem) : Ok(value)
}
