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
