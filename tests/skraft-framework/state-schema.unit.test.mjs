import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOk, isErr } from '../../plugins/src/domain/result.mjs'
import { validateState } from '../../plugins/src/domain/state-schema.mjs'

const VALID = { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: ['DESIGN'] }

test('D3: a well-formed state is accepted and frozen', () => {
  const result = validateState(VALID)
  assert.ok(isOk(result))
  assert.ok(Object.isFrozen(result.value), 'returned pipeline state is frozen')
  assert.ok(Object.isFrozen(result.value.skipPhases), 'skipPhases is frozen')
})

// D3 — invalid-field grid: one reject branch per field (combinatorial_economy).
const INVALID_ROWS = [
  { field: 'currentPhase', raw: { ...VALID, currentPhase: '' } },
  { field: 'specialistDone', raw: { ...VALID, specialistDone: 'yes' } },
  { field: 'reviewerVerdict', raw: { ...VALID, reviewerVerdict: 'MAYBE' } },
  { field: 'retries', raw: { ...VALID, retries: 1.5 } },
  { field: 'retries', raw: { ...VALID, retries: -1 } },
  { field: 'skipPhases', raw: { ...VALID, skipPhases: 'DESIGN' } },
  { field: 'skipPhases', raw: { ...VALID, skipPhases: [42] } }
]
for (const { field, raw } of INVALID_ROWS) {
  test(`D3: invalid ${field} (${JSON.stringify(raw[field])}) is rejected as INVALID_STATE`, () => {
    const result = validateState(raw)
    assert.ok(isErr(result))
    assert.equal(result.error.code, 'INVALID_STATE')
    assert.ok(result.error.fields.includes(field), `fields names ${field}`)
  })
}

test('D3: a non-object state is rejected', () => {
  assert.ok(isErr(validateState(null)))
  assert.ok(isErr(validateState([])))
})
