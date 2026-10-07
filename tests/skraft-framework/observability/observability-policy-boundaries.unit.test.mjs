import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HOUR_MS,
  DAY_MS,
  DEFAULT_OBSERVABILITY,
  resolveObservabilityConfig,
  detectStalePhase,
  planAuditRetention,
  planStaleSignals,
  isStaleSignalFile,
} from '../../../plugins/skraft-framework/src/domain/observability-policy.mjs'

test('HOUR_MS and DAY_MS are milliseconds', () => {
  assert.equal(HOUR_MS, 3_600_000)
  assert.equal(DAY_MS, 86_400_000)
})

test('resolveObservabilityConfig: non-number, infinite, zero and negative thresholds fall back', () => {
  for (const bad of ['5', Infinity, -Infinity, NaN, 0, -3, null, true]) {
    assert.deepEqual(
      { ...resolveObservabilityConfig({ observability: { stalePhaseHours: bad, auditRetentionDays: bad, signalRetentionDays: bad } }) },
      { ...DEFAULT_OBSERVABILITY },
      `value ${String(bad)}`,
    )
  }
  assert.deepEqual(
    { ...resolveObservabilityConfig({ observability: { stalePhaseHours: 0.5, auditRetentionDays: 7, signalRetentionDays: 1 } }) },
    { stalePhaseHours: 0.5, auditRetentionDays: 7, signalRetentionDays: 1 },
  )
})

test('detectStalePhase: an empty phase name is reported as null', () => {
  const result = detectStalePhase({ currentPhase: '', lastUpdatedMs: 0, nowMs: 0, stalePhaseHours: 1 })
  assert.deepEqual(result, { level: 'ok', phase: null, ageMs: 0, thresholdMs: HOUR_MS })
})

test('detectStalePhase: a non-finite timestamp is unknown', () => {
  assert.deepEqual(
    detectStalePhase({ currentPhase: 'DESIGN', lastUpdatedMs: NaN, nowMs: 10 * HOUR_MS, stalePhaseHours: 1 }),
    { level: 'unknown', phase: 'DESIGN', ageMs: null, thresholdMs: HOUR_MS },
  )
  assert.equal(detectStalePhase({ currentPhase: 'DESIGN', lastUpdatedMs: -Infinity, nowMs: 10 * HOUR_MS }).level, 'unknown')
  assert.equal(detectStalePhase({ currentPhase: 'DESIGN', lastUpdatedMs: 0, nowMs: NaN }).level, 'unknown')
  assert.equal(detectStalePhase({ currentPhase: 'DESIGN', lastUpdatedMs: 0, nowMs: Infinity }).level, 'unknown')
  assert.equal(detectStalePhase({ currentPhase: 'DESIGN', lastUpdatedMs: 0, nowMs: '100' }).level, 'unknown')
})

test('detectStalePhase: a warning without a phase names it "?"', () => {
  const result = detectStalePhase({ lastUpdatedMs: 0, nowMs: 25 * HOUR_MS, stalePhaseHours: 24 })
  assert.equal(result.level, 'warn')
  assert.equal(result.phase, null)
  assert.equal(result.message, 'phase ? in progress for 25h (threshold 24h)')
})

const NOW = 100 * DAY_MS

test('planAuditRetention: blank and non-string lines are dropped', () => {
  const result = planAuditRetention({ lines: ['', '   ', 42, null, '{"ts":1}'], nowMs: NOW, retentionDays: 1 })
  assert.deepEqual(result, { kept: [], purged: 1 })
})

test('planAuditRetention: a JSON null or non-object line is kept, never aged', () => {
  const lines = ['null', '42', '"2000-01-01T00:00:00Z"', 'not json']
  assert.deepEqual(planAuditRetention({ lines, nowMs: NOW, retentionDays: 1 }), { kept: lines, purged: 0 })
})

test('planAuditRetention: only finite numbers and date strings are timestamps', () => {
  const lines = [
    '{"ts":-1e999}',
    '{"ts":["1970-01-02T00:00:00Z"]}',
    '{"ts":true}',
    '{"other":1}',
  ]
  assert.deepEqual(planAuditRetention({ lines, nowMs: NOW, retentionDays: 1 }), { kept: lines, purged: 0 })
  assert.deepEqual(
    planAuditRetention({ lines: ['{"timestamp":"1970-01-02T00:00:00Z"}'], nowMs: NOW, retentionDays: 1 }),
    { kept: [], purged: 1 },
  )
})

test('planAuditRetention: a line exactly at the cutoff is kept', () => {
  const atCutoff = JSON.stringify({ ts: NOW - DAY_MS })
  const before = JSON.stringify({ ts: NOW - DAY_MS - 1 })
  assert.deepEqual(planAuditRetention({ lines: [atCutoff, before], nowMs: NOW, retentionDays: 1 }), { kept: [atCutoff], purged: 1 })
})

test('planAuditRetention: a missing or non-finite now falls back to the real clock', () => {
  const ancient = JSON.stringify({ ts: 1 })
  const farFuture = JSON.stringify({ ts: 4_000_000_000_000 })
  assert.deepEqual(planAuditRetention({ lines: [ancient, farFuture], retentionDays: 1 }), { kept: [farFuture], purged: 1 })
  assert.deepEqual(planAuditRetention({ lines: [ancient, farFuture], nowMs: Infinity, retentionDays: 1 }), { kept: [farFuture], purged: 1 })
  assert.deepEqual(planAuditRetention({ lines: [ancient, farFuture], nowMs: NaN, retentionDays: 1 }), { kept: [farFuture], purged: 1 })
})

test('planStaleSignals: malformed entries are never purged', () => {
  const entries = [
    null,
    { name: 'no-mtime' },
    { mtimeMs: 0 },
    { name: 5, mtimeMs: 0 },
    { name: 'string-mtime', mtimeMs: '0' },
    { name: 'nan-mtime', mtimeMs: NaN },
    { name: 'minus-infinity', mtimeMs: -Infinity },
    { name: 'old', mtimeMs: 0 },
  ]
  assert.deepEqual(planStaleSignals({ entries, nowMs: NOW, retentionDays: 1 }), { purge: ['old'] })
  assert.deepEqual(planStaleSignals({ entries: 'nope', nowMs: NOW }), { purge: [] })
})

test('planStaleSignals: an entry exactly at the cutoff is kept', () => {
  const entries = [{ name: 'at', mtimeMs: NOW - DAY_MS }, { name: 'before', mtimeMs: NOW - DAY_MS - 1 }]
  assert.deepEqual(planStaleSignals({ entries, nowMs: NOW, retentionDays: 1 }), { purge: ['before'] })
})

test('planStaleSignals: a missing or non-finite now falls back to the real clock', () => {
  const entries = [{ name: 'ancient', mtimeMs: 1 }, { name: 'future', mtimeMs: 4_000_000_000_000 }]
  assert.deepEqual(planStaleSignals({ entries, retentionDays: 1 }), { purge: ['ancient'] })
  assert.deepEqual(planStaleSignals({ entries, nowMs: Infinity, retentionDays: 1 }), { purge: ['ancient'] })
})

test('isStaleSignalFile: anchored names only, strings only', () => {
  assert.equal(isStaleSignalFile('state.json.bak.1'), true)
  assert.equal(isStaleSignalFile('state.json.corrupted.1'), true)
  assert.equal(isStaleSignalFile('x-state.json.bak.1'), false)
  assert.equal(isStaleSignalFile('state.json.bak.1.tmp'), false)
  assert.equal(isStaleSignalFile('x-state.json.corrupted.1'), false)
  assert.equal(isStaleSignalFile('state.json.corrupted.1.tmp'), false)
  assert.equal(isStaleSignalFile(['state.json.bak.1']), false)
  assert.equal(isStaleSignalFile(['state.json.corrupted.1']), false)
})
