import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_OBSERVABILITY,
  HOUR_MS,
  DAY_MS,
  resolveObservabilityConfig,
  detectStalePhase,
  planAuditRetention,
  planStaleSignals,
  isStaleSignalFile,
} from '../../plugins/skraft-framework/src/domain/observability-policy.mjs'

// ─── resolveObservabilityConfig ─────────────────────────────────────────────────

test('resolveObservabilityConfig: null/undefined → all defaults', () => {
  assert.deepEqual(resolveObservabilityConfig(null), DEFAULT_OBSERVABILITY)
  assert.deepEqual(resolveObservabilityConfig(undefined), DEFAULT_OBSERVABILITY)
})

test('resolveObservabilityConfig: reads the observability block', () => {
  const cfg = resolveObservabilityConfig({
    depthTier: 'basic',
    observability: { stalePhaseHours: 6, auditRetentionDays: 7, signalRetentionDays: 3 },
  })
  assert.equal(cfg.stalePhaseHours, 6)
  assert.equal(cfg.auditRetentionDays, 7)
  assert.equal(cfg.signalRetentionDays, 3)
})

test('resolveObservabilityConfig: bad values (0, negative, NaN, string) → defaults', () => {
  const cfg = resolveObservabilityConfig({
    observability: { stalePhaseHours: 0, auditRetentionDays: -5, signalRetentionDays: 'nope' },
  })
  assert.deepEqual(cfg, DEFAULT_OBSERVABILITY)
})

test('resolveObservabilityConfig: array config / array block ignored → defaults', () => {
  assert.deepEqual(resolveObservabilityConfig([1, 2, 3]), DEFAULT_OBSERVABILITY)
  assert.deepEqual(resolveObservabilityConfig({ observability: [1, 2] }), DEFAULT_OBSERVABILITY)
})

test('resolveObservabilityConfig: partial block keeps defaults for the rest', () => {
  const cfg = resolveObservabilityConfig({ observability: { stalePhaseHours: 48 } })
  assert.equal(cfg.stalePhaseHours, 48)
  assert.equal(cfg.auditRetentionDays, DEFAULT_OBSERVABILITY.auditRetentionDays)
  assert.equal(cfg.signalRetentionDays, DEFAULT_OBSERVABILITY.signalRetentionDays)
})

// ─── detectStalePhase ───────────────────────────────────────────────────────────

test('detectStalePhase: within threshold → ok', () => {
  const now = 1_000_000_000_000
  const r = detectStalePhase({ currentPhase: 'DESIGN', lastUpdatedMs: now - HOUR_MS, nowMs: now, stalePhaseHours: 24 })
  assert.equal(r.level, 'ok')
  assert.equal(r.phase, 'DESIGN')
  assert.equal(r.ageMs, HOUR_MS)
  assert.equal(r.message, undefined)
})

test('detectStalePhase: past threshold → warn with message', () => {
  const now = 1_000_000_000_000
  const r = detectStalePhase({ currentPhase: 'DELIVER', lastUpdatedMs: now - 30 * HOUR_MS, nowMs: now, stalePhaseHours: 24 })
  assert.equal(r.level, 'warn')
  assert.equal(r.phase, 'DELIVER')
  assert.equal(r.thresholdMs, 24 * HOUR_MS)
  assert.match(r.message, /DELIVER/)
  assert.match(r.message, /30h/)
  assert.match(r.message, /24h/)
})

test('detectStalePhase: missing/invalid lastUpdatedMs → unknown (fail-open, no warn)', () => {
  const r = detectStalePhase({ currentPhase: 'DISCOVER', lastUpdatedMs: null, nowMs: 1000, stalePhaseHours: 24 })
  assert.equal(r.level, 'unknown')
  assert.equal(r.ageMs, null)
  assert.equal(r.phase, 'DISCOVER')
})

test('detectStalePhase: invalid nowMs → unknown', () => {
  const r = detectStalePhase({ currentPhase: 'DISCOVER', lastUpdatedMs: 1000, nowMs: NaN, stalePhaseHours: 24 })
  assert.equal(r.level, 'unknown')
})

test('detectStalePhase: exactly at threshold is not stale', () => {
  const now = 1_000_000_000_000
  const r = detectStalePhase({ currentPhase: 'DESIGN', lastUpdatedMs: now - 24 * HOUR_MS, nowMs: now, stalePhaseHours: 24 })
  assert.equal(r.level, 'ok')
})

test('detectStalePhase: future timestamp clamps age to 0', () => {
  const now = 1_000_000_000_000
  const r = detectStalePhase({ currentPhase: 'DESIGN', lastUpdatedMs: now + HOUR_MS, nowMs: now, stalePhaseHours: 24 })
  assert.equal(r.ageMs, 0)
  assert.equal(r.level, 'ok')
})

test('detectStalePhase: empty/absent phase → null phase', () => {
  const r = detectStalePhase({ currentPhase: '', lastUpdatedMs: 1000, nowMs: 2000, stalePhaseHours: 24 })
  assert.equal(r.phase, null)
})

test('detectStalePhase: invalid stalePhaseHours falls back to default threshold', () => {
  const now = DEFAULT_OBSERVABILITY.stalePhaseHours * HOUR_MS + 10 * HOUR_MS
  const r = detectStalePhase({ currentPhase: 'DESIGN', lastUpdatedMs: 0, nowMs: now, stalePhaseHours: -1 })
  assert.equal(r.thresholdMs, DEFAULT_OBSERVABILITY.stalePhaseHours * HOUR_MS)
  assert.equal(r.level, 'warn')
})

// ─── planAuditRetention ─────────────────────────────────────────────────────────

const line = (ts) => JSON.stringify({ event: 'x', timestamp: new Date(ts).toISOString() })

test('planAuditRetention: keeps recent, purges old', () => {
  const now = 1_700_000_000_000
  const lines = [
    line(now - 1 * DAY_MS),
    line(now - 40 * DAY_MS),
    line(now - 5 * DAY_MS),
  ]
  const { kept, purged } = planAuditRetention({ lines, nowMs: now, retentionDays: 30 })
  assert.equal(purged, 1)
  assert.equal(kept.length, 2)
})

test('planAuditRetention: blank lines dropped, undatable lines kept', () => {
  const now = 1_700_000_000_000
  const lines = ['', '   ', 'not json', JSON.stringify({ event: 'no-ts' }), line(now - 1 * DAY_MS)]
  const { kept, purged } = planAuditRetention({ lines, nowMs: now, retentionDays: 30 })
  assert.equal(purged, 0)
  assert.equal(kept.length, 3, 'blank lines dropped; undatable + recent kept')
})

test('planAuditRetention: epoch-number timestamps supported', () => {
  const now = 1_700_000_000_000
  const lines = [JSON.stringify({ ts: now - 40 * DAY_MS }), JSON.stringify({ ts: now - 1 * DAY_MS })]
  const { kept, purged } = planAuditRetention({ lines, nowMs: now, retentionDays: 30 })
  assert.equal(purged, 1)
  assert.equal(kept.length, 1)
})

test('planAuditRetention: non-array lines → empty', () => {
  const { kept, purged } = planAuditRetention({ lines: null, nowMs: 1000, retentionDays: 30 })
  assert.deepEqual(kept, [])
  assert.equal(purged, 0)
})

// ─── planStaleSignals ───────────────────────────────────────────────────────────

test('planStaleSignals: purges entries older than the retention window', () => {
  const now = 1_700_000_000_000
  const entries = [
    { name: 'state.json.bak.1', mtimeMs: now - 20 * DAY_MS },
    { name: 'state.json.bak.2', mtimeMs: now - 3 * DAY_MS },
  ]
  const { purge } = planStaleSignals({ entries, nowMs: now, retentionDays: 14 })
  assert.deepEqual(purge, ['state.json.bak.1'])
})

test('planStaleSignals: entries without usable mtime never purged', () => {
  const now = 1_700_000_000_000
  const entries = [{ name: 'a', mtimeMs: 'nope' }, { name: 'b' }, { name: 'c', mtimeMs: NaN }]
  const { purge } = planStaleSignals({ entries, nowMs: now, retentionDays: 14 })
  assert.deepEqual(purge, [])
})

// ─── isStaleSignalFile ──────────────────────────────────────────────────────────

test('isStaleSignalFile: matches backups and corruption snapshots only', () => {
  assert.equal(isStaleSignalFile('state.json.bak.1700000000000'), true)
  assert.equal(isStaleSignalFile('state.json.corrupted.1700000000000'), true)
  assert.equal(isStaleSignalFile('state.json'), false)
  assert.equal(isStaleSignalFile('state.json.tmp.123'), false)
  assert.equal(isStaleSignalFile('state.json.bak.notnumber'), false)
  assert.equal(isStaleSignalFile(null), false)
})
