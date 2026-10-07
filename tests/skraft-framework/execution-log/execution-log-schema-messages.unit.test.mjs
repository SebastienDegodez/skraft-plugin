import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateEntry,
  validateLog,
  appendEntry,
  verifyIntegrity,
} from '../../../plugins/skraft-framework/src/domain/execution-log-schema.mjs'

const TS = '2026-07-12T20:54:18.931Z'
const validLog = (entries = []) => ({ slug: 'us9', createdAt: TS, entries })
const entry = (step, phase, timestamp = TS) => ({ step, phase, timestamp })

test('validateEntry: an expanded-year ISO string is not an accepted timestamp', () => {
  const result = validateEntry(entry('s1', 'RED', '+012026-01-01T00:00:00.000Z'))
  assert.equal(result.ok, false)
  assert.deepEqual(result.error.fields, ['timestamp'])
})

test('validateEntry: a calendar-invalid date that the parser rolls over is rejected', () => {
  const result = validateEntry(entry('s1', 'RED', '2026-02-30T00:00:00.000Z'))
  assert.equal(result.ok, false)
  assert.deepEqual(result.error.fields, ['timestamp'])
})

test('validateEntry: a non-object entry is rejected as a whole', () => {
  for (const raw of [null, 'RED', 42, ['RED']]) {
    assert.deepEqual(validateEntry(raw), {
      ok: false,
      error: { code: 'INVALID_ENTRY', fields: ['entry'], reason: 'log entry must be an object' },
    }, `raw ${JSON.stringify(raw)}`)
  }
})

test('validateEntry: the reason lists every invalid field, comma-separated', () => {
  assert.deepEqual(validateEntry({ note: 5 }), {
    ok: false,
    error: {
      code: 'INVALID_ENTRY',
      fields: ['step', 'phase', 'timestamp', 'note'],
      reason: 'log entry is invalid in field(s): step, phase, timestamp, note',
    },
  })
})

test('validateLog: a non-object log is rejected as a whole', () => {
  for (const raw of [null, undefined, 'log', 7, [validLog()]]) {
    assert.deepEqual(validateLog(raw), {
      ok: false,
      error: { code: 'INVALID_LOG', fields: ['log'], reason: 'execution log must be an object' },
    }, `raw ${String(raw)}`)
  }
})

test('validateLog: each missing top-level field has its own error', () => {
  assert.deepEqual(validateLog({ createdAt: TS, entries: [] }).error, {
    code: 'INVALID_LOG', fields: ['slug'], reason: 'execution log slug must be a non-empty string',
  })
  assert.deepEqual(validateLog({ slug: 'x', createdAt: '2026-07-12', entries: [] }).error, {
    code: 'INVALID_LOG', fields: ['createdAt'], reason: 'execution log createdAt must be a real UTC ISO-8601 timestamp',
  })
  assert.deepEqual(validateLog({ slug: 'x', createdAt: TS, entries: {} }).error, {
    code: 'INVALID_LOG', fields: ['entries'], reason: 'execution log entries must be an array',
  })
})

test('validateLog: an invalid entry is reported with its index and reason', () => {
  const result = validateLog(validLog([entry('s1', 'RED'), entry('s1', 'NOPE')]))
  assert.deepEqual(result.error, {
    code: 'INVALID_LOG',
    fields: ['entries[1]'],
    reason: 'entry 1: log entry is invalid in field(s): phase',
  })
})

test('appendEntry: an invalid log or entry is returned unchanged', () => {
  assert.equal(appendEntry(null, entry('s1', 'RED')).error.code, 'INVALID_LOG')
  assert.equal(appendEntry(validLog(), null).error.code, 'INVALID_ENTRY')
})

test('verifyIntegrity: an empty log has no steps', () => {
  assert.deepEqual(verifyIntegrity(validLog()), {
    ok: false,
    error: { code: 'INCOMPLETE_LOG', reason: 'execution log has no steps', incomplete: [] },
  })
})

test('verifyIntegrity: a step that reached COMMIT but skipped phases is still incomplete', () => {
  const result = verifyIntegrity(validLog([entry('s1', 'COMMIT')]))
  assert.equal(result.ok, false)
  assert.equal(result.error.reason, '1 step(s) missing required TDD phases')
  assert.deepEqual(result.error.incomplete, [{ step: 's1', missing: ['RED', 'GREEN', 'REFACTOR'], reachedTerminal: true }])
})

test('verifyIntegrity: the reason counts every incomplete step', () => {
  const result = verifyIntegrity(validLog([entry('s1', 'RED'), entry('s2', 'GREEN')]))
  assert.equal(result.error.reason, '2 step(s) missing required TDD phases')
})

test('verifyIntegrity: a complete log lists each step with its logged phases, frozen', () => {
  const log = validLog(['RED', 'GREEN', 'REFACTOR', 'COMMIT', 'GREEN'].map((phase) => entry('s1', phase))
    .concat(['RED', 'GREEN', 'REFACTOR', 'COMMIT'].map((phase) => entry('s2', phase))))
  const result = verifyIntegrity(log)
  assert.equal(result.ok, true)
  assert.deepEqual(result.value, {
    complete: true,
    steps: [
      { step: 's1', phases: ['RED', 'GREEN', 'REFACTOR', 'COMMIT'] },
      { step: 's2', phases: ['RED', 'GREEN', 'REFACTOR', 'COMMIT'] },
    ],
  })
  assert.equal(Object.isFrozen(result.value.steps[0]), true)
  assert.equal(Object.isFrozen(result.value.steps[0].phases), true)
})
