import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAGNOSIS,
  parseBackupTimestamp,
  isStalePhase,
  selectRollbackTarget,
  buildRecoveryGuidance,
} from '../../plugins/skraft-framework/src/domain/recovery-policy.mjs'

const validState = (overrides = {}) => ({
  currentPhase: 'DESIGN',
  phasesCompleted: ['DISCOVER', 'DISCUSS'],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: {},
  userPreferences: { maxRetriesPerPhase: 2 },
  ...overrides,
})

// ─── parseBackupTimestamp ───────────────────────────────────────────────────
test('parseBackupTimestamp: extracts numeric ts from a rotating backup name', () => {
  assert.equal(parseBackupTimestamp('state.json.bak.1700000000000'), 1700000000000)
})

test('parseBackupTimestamp: returns NaN for non-backup names', () => {
  assert.ok(Number.isNaN(parseBackupTimestamp('state.json')))
  assert.ok(Number.isNaN(parseBackupTimestamp('state.json.corrupted.123')))
  assert.ok(Number.isNaN(parseBackupTimestamp('state.json.bak.abc')))
})

// ─── isStalePhase ───────────────────────────────────────────────────────────
test('isStalePhase: true when retries exhausted and verdict not APPROVED', () => {
  const state = validState({ retryCount: { DESIGN: 2 }, verdicts: { DESIGN: 'CHANGES_REQUESTED' } })
  assert.equal(isStalePhase(state), true)
})

test('isStalePhase: false when retries below the cap', () => {
  const state = validState({ retryCount: { DESIGN: 1 }, verdicts: { DESIGN: 'CHANGES_REQUESTED' } })
  assert.equal(isStalePhase(state), false)
})

test('isStalePhase: false when verdict APPROVED even if retries exhausted', () => {
  const state = validState({ retryCount: { DESIGN: 2 }, verdicts: { DESIGN: 'APPROVED' } })
  assert.equal(isStalePhase(state), false)
})

test('isStalePhase: honours a custom maxRetriesPerPhase', () => {
  const state = validState({ retryCount: { DESIGN: 3 }, userPreferences: { maxRetriesPerPhase: 3 } })
  assert.equal(isStalePhase(state), true)
})

// ─── selectRollbackTarget ───────────────────────────────────────────────────
test('selectRollbackTarget: picks the most recent healthy backup', () => {
  const backups = [
    { name: 'state.json.bak.100', timestamp: 100, raw: validState({ currentPhase: 'DISCOVER' }) },
    { name: 'state.json.bak.300', timestamp: 300, raw: validState({ currentPhase: 'DESIGN' }) },
    { name: 'state.json.bak.200', timestamp: 200, raw: validState({ currentPhase: 'DISCUSS' }) },
  ]
  const target = selectRollbackTarget(backups)
  assert.equal(target.name, 'state.json.bak.300')
})

test('selectRollbackTarget: skips corrupt/invalid backups, chooses newest healthy', () => {
  const backups = [
    { name: 'state.json.bak.400', timestamp: 400, raw: null },
    { name: 'state.json.bak.300', timestamp: 300, raw: { garbage: true } },
    { name: 'state.json.bak.200', timestamp: 200, raw: validState() },
  ]
  const target = selectRollbackTarget(backups)
  assert.equal(target.name, 'state.json.bak.200')
})

test('selectRollbackTarget: returns null when no healthy backup exists', () => {
  assert.equal(selectRollbackTarget([{ name: 'state.json.bak.1', timestamp: 1, raw: null }]), null)
  assert.equal(selectRollbackTarget([]), null)
  assert.equal(selectRollbackTarget(undefined), null)
})

// ─── buildRecoveryGuidance ──────────────────────────────────────────────────
test('buildRecoveryGuidance: every diagnosis produces WHY/HOW/ACTION', () => {
  for (const code of Object.values(DIAGNOSIS)) {
    const g = buildRecoveryGuidance({ code, slug: 'demo' })
    assert.ok(g.why.length > 0, `${code} why`)
    assert.ok(Array.isArray(g.how) && g.how.length > 0, `${code} how`)
    assert.ok(typeof g.action === 'string' && g.action.length > 0, `${code} action`)
  }
})

test('buildRecoveryGuidance: corrupted with backup → rollback action', () => {
  const g = buildRecoveryGuidance({ code: DIAGNOSIS.CORRUPTED_STATE, slug: 'demo', backupCount: 2 })
  assert.equal(g.code, DIAGNOSIS.CORRUPTED_STATE)
  assert.match(g.action, /rollback --slug demo/)
})

test('buildRecoveryGuidance: corrupted without backup → init action', () => {
  const g = buildRecoveryGuidance({ code: DIAGNOSIS.CORRUPTED_STATE, slug: 'demo', backupCount: 0 })
  assert.match(g.action, /init --slug demo/)
})

test('buildRecoveryGuidance: missing without backup → init action', () => {
  const g = buildRecoveryGuidance({ code: DIAGNOSIS.MISSING_STATE, slug: 'demo', backupCount: 0 })
  assert.match(g.action, /init --slug demo/)
})

test('buildRecoveryGuidance: stale → resolve-stale action with phase', () => {
  const g = buildRecoveryGuidance({ code: DIAGNOSIS.STALE, slug: 'demo', phase: 'DESIGN' })
  assert.equal(g.code, DIAGNOSIS.STALE)
  assert.match(g.action, /resolve-stale --slug demo --phase DESIGN/)
})

test('buildRecoveryGuidance: unknown code falls back to IO_ERROR guidance', () => {
  const g = buildRecoveryGuidance({ code: 'SOMETHING_ELSE', slug: 'demo' })
  assert.equal(g.code, DIAGNOSIS.IO_ERROR)
})
