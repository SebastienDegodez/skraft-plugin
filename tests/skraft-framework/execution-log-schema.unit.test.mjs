import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TDD_PHASES,
  REQUIRED_PHASES,
  TERMINAL_PHASES,
  isValidPhase,
  validateEntry,
  validateLog,
  appendEntry,
  verifyIntegrity,
} from '../../plugins/skraft-framework/src/domain/execution-log-schema.mjs'

const TS = '2026-07-12T20:54:18.931Z'

const validLog = (entries = []) => ({ slug: 'us9', createdAt: TS, entries })
const entry = (step, phase, timestamp = TS) => ({ step, phase, timestamp })

// ─── constants ──────────────────────────────────────────────────────────────
test('TDD_PHASES is the ordered canonical cycle', () => {
  assert.deepEqual(TDD_PHASES, ['RED', 'GREEN', 'REFACTOR', 'COMMIT'])
})

test('TERMINAL_PHASES contains COMMIT', () => {
  assert.deepEqual(TERMINAL_PHASES, ['COMMIT'])
})

test('REQUIRED_PHASES covers the full cycle', () => {
  assert.deepEqual(REQUIRED_PHASES, ['RED', 'GREEN', 'REFACTOR', 'COMMIT'])
})

test('isValidPhase accepts canonical phases and rejects others', () => {
  assert.equal(isValidPhase('RED'), true)
  assert.equal(isValidPhase('COMMIT'), true)
  assert.equal(isValidPhase('FOO'), false)
  assert.equal(isValidPhase('red'), false)
  assert.equal(isValidPhase(undefined), false)
})

// ─── validateEntry ────────────────────────────────────────────────────────────
test('validateEntry: accepts a well-formed entry and freezes it', () => {
  const r = validateEntry(entry('1', 'RED'))
  assert.equal(r.ok, true)
  assert.deepEqual(r.value, { step: '1', phase: 'RED', timestamp: TS })
  assert.equal(Object.isFrozen(r.value), true)
})

test('validateEntry: keeps an optional string note', () => {
  const r = validateEntry({ step: '1', phase: 'RED', timestamp: TS, note: 'why' })
  assert.equal(r.ok, true)
  assert.equal(r.value.note, 'why')
})

test('validateEntry: rejects a non-object', () => {
  const r = validateEntry(null)
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_ENTRY')
})

test('validateEntry: rejects empty step', () => {
  const r = validateEntry(entry('', 'RED'))
  assert.equal(r.ok, false)
  assert.ok(r.error.fields.includes('step'))
})

test('validateEntry: rejects an unknown phase', () => {
  const r = validateEntry(entry('1', 'DEPLOY'))
  assert.equal(r.ok, false)
  assert.ok(r.error.fields.includes('phase'))
})

test('validateEntry: rejects a non-UTC / non-ISO timestamp', () => {
  for (const bad of ['2026-07-12', '2026-07-12T20:54:18Z', '2026-07-12T20:54:18.931+02:00', 'not-a-date', 12345]) {
    const r = validateEntry({ step: '1', phase: 'RED', timestamp: bad })
    assert.equal(r.ok, false, `expected reject for ${bad}`)
    assert.ok(r.error.fields.includes('timestamp'))
  }
})

test('validateEntry: rejects an impossible UTC date that matches the pattern', () => {
  const r = validateEntry({ step: '1', phase: 'RED', timestamp: '2026-13-40T25:61:61.999Z' })
  assert.equal(r.ok, false)
  assert.ok(r.error.fields.includes('timestamp'))
})

test('validateEntry: rejects a non-string note', () => {
  const r = validateEntry({ step: '1', phase: 'RED', timestamp: TS, note: 42 })
  assert.equal(r.ok, false)
  assert.ok(r.error.fields.includes('note'))
})

// ─── validateLog ──────────────────────────────────────────────────────────────
test('validateLog: accepts an empty log', () => {
  const r = validateLog(validLog())
  assert.equal(r.ok, true)
  assert.deepEqual(r.value.entries, [])
})

test('validateLog: rejects a missing slug', () => {
  const r = validateLog({ createdAt: TS, entries: [] })
  assert.equal(r.ok, false)
  assert.ok(r.error.fields.includes('slug'))
})

test('validateLog: rejects a non-ISO createdAt', () => {
  const r = validateLog({ slug: 'us9', createdAt: 'yesterday', entries: [] })
  assert.equal(r.ok, false)
  assert.ok(r.error.fields.includes('createdAt'))
})

test('validateLog: rejects non-array entries', () => {
  const r = validateLog({ slug: 'us9', createdAt: TS, entries: {} })
  assert.equal(r.ok, false)
  assert.ok(r.error.fields.includes('entries'))
})

test('validateLog: reports the index of the first invalid entry', () => {
  const r = validateLog(validLog([entry('1', 'RED'), entry('1', 'NOPE')]))
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_LOG')
  assert.ok(r.error.fields.includes('entries[1]'))
})

// ─── appendEntry ────────────────────────────────────────────────────────────
test('appendEntry: returns a new log with the entry appended', () => {
  const r = appendEntry(validLog([entry('1', 'RED')]), entry('1', 'GREEN'))
  assert.equal(r.ok, true)
  assert.equal(r.value.entries.length, 2)
  assert.equal(r.value.entries[1].phase, 'GREEN')
  assert.equal(Object.isFrozen(r.value), true)
})

test('appendEntry: rejects an invalid entry', () => {
  const r = appendEntry(validLog(), entry('1', 'BAD'))
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_ENTRY')
})

test('appendEntry: rejects an invalid base log', () => {
  const r = appendEntry({ slug: '', createdAt: TS, entries: [] }, entry('1', 'RED'))
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_LOG')
})

// ─── verifyIntegrity ──────────────────────────────────────────────────────────
const fullStep = (step) => REQUIRED_PHASES.map((phase) => entry(step, phase))

test('verifyIntegrity: Ok when every step has all required phases', () => {
  const r = verifyIntegrity(validLog([...fullStep('1'), ...fullStep('2')]))
  assert.equal(r.ok, true)
  assert.equal(r.value.complete, true)
  assert.equal(r.value.steps.length, 2)
})

test('verifyIntegrity: Err with no steps on an empty log', () => {
  const r = verifyIntegrity(validLog())
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INCOMPLETE_LOG')
  assert.deepEqual(r.error.incomplete, [])
})

test('verifyIntegrity: Err listing the missing phases of an incomplete step', () => {
  const r = verifyIntegrity(validLog([entry('1', 'RED'), entry('1', 'GREEN')]))
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INCOMPLETE_LOG')
  assert.equal(r.error.incomplete.length, 1)
  assert.equal(r.error.incomplete[0].step, '1')
  assert.deepEqual(r.error.incomplete[0].missing, ['REFACTOR', 'COMMIT'])
  assert.equal(r.error.incomplete[0].reachedTerminal, false)
})

test('verifyIntegrity: fails a step that has all phases except the terminal one', () => {
  const r = verifyIntegrity(validLog([entry('1', 'RED'), entry('1', 'GREEN'), entry('1', 'REFACTOR')]))
  assert.equal(r.ok, false)
  assert.deepEqual(r.error.incomplete[0].missing, ['COMMIT'])
})

test('verifyIntegrity: one complete + one incomplete step reports only the incomplete', () => {
  const r = verifyIntegrity(validLog([...fullStep('1'), entry('2', 'RED')]))
  assert.equal(r.ok, false)
  assert.equal(r.error.incomplete.length, 1)
  assert.equal(r.error.incomplete[0].step, '2')
})

test('verifyIntegrity: propagates a schema error from a malformed log', () => {
  const r = verifyIntegrity({ slug: 'us9', createdAt: TS, entries: [entry('1', 'BAD')] })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_LOG')
})
