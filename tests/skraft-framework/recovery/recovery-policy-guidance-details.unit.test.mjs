import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAGNOSIS,
  parseBackupTimestamp,
  isStalePhase,
  selectRollbackTarget,
  buildRecoveryGuidance,
  recoveryStepOf,
} from '../../../plugins/skraft-framework/src/domain/recovery-policy.mjs'

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

const RECONSTRUCT = 'Then record the artefacts of each phase the on-disk evidence shows completed and close it, in phase order; confirm the reconstruction with the user before resuming.'

test('DIAGNOSIS: every code is its own name', () => {
  assert.deepEqual({ ...DIAGNOSIS }, {
    HEALTHY: 'HEALTHY',
    MISSING_STATE: 'MISSING_STATE',
    CORRUPTED_STATE: 'CORRUPTED_STATE',
    INVALID_STATE: 'INVALID_STATE',
    STALE: 'STALE',
    IO_ERROR: 'IO_ERROR',
  })
})

test('parseBackupTimestamp: the backup name is anchored at both ends', () => {
  assert.ok(Number.isNaN(parseBackupTimestamp('old.state.json.bak.123')))
  assert.ok(Number.isNaN(parseBackupTimestamp('state.json.bak.123.tmp')))
  assert.equal(parseBackupTimestamp('state.json.bak.7'), 7)
})

test('isStalePhase: an explicit phase with an absent state uses the defaults', () => {
  assert.equal(isStalePhase(undefined, 'DESIGN'), false)
  assert.equal(isStalePhase(null, 'DESIGN'), false)
})

test('isStalePhase: a state without preferences, retries or verdicts is not stale', () => {
  assert.equal(isStalePhase({}, 'DESIGN'), false)
  assert.equal(isStalePhase({ currentPhase: 'DESIGN' }), false)
})

test('isStalePhase: a larger cap is honoured (not replaced by the default)', () => {
  const state = validState({ retryCount: { DESIGN: 3 }, userPreferences: { maxRetriesPerPhase: 5 } })
  assert.equal(isStalePhase(state), false)
  assert.equal(isStalePhase(validState({ retryCount: { DESIGN: 5 }, userPreferences: { maxRetriesPerPhase: 5 } })), true)
})

test('selectRollbackTarget: null entries are skipped', () => {
  const healthy = { name: 'state.json.bak.10', timestamp: 10, raw: validState() }
  assert.equal(selectRollbackTarget([null, healthy, undefined]), healthy)
  assert.equal(selectRollbackTarget(undefined), null)
  assert.equal(selectRollbackTarget([]), null)
})

test('buildRecoveryGuidance: an absent diagnosis is an IO error with the slug placeholder', () => {
  assert.deepEqual(buildRecoveryGuidance(undefined), {
    code: 'IO_ERROR',
    why: 'state.json for {slug} could not be read.',
    how: ['Check filesystem permissions and disk availability, then retry the read.'],
    action: 'state.mjs get --slug {slug}',
    step: 'halt',
  })
})

test('buildRecoveryGuidance: an IO error carries its reason', () => {
  assert.equal(
    buildRecoveryGuidance({ code: 'IO_ERROR', slug: 's', reason: 'EACCES' }).why,
    'state.json for s could not be read: EACCES',
  )
})

test('buildRecoveryGuidance: HEALTHY', () => {
  assert.deepEqual(buildRecoveryGuidance({ code: 'HEALTHY', slug: 's' }), {
    code: 'HEALTHY',
    why: 'state.json for s is present and passes schema validation.',
    how: ['No recovery required — resume the pipeline normally.'],
    action: 'state.mjs get --slug s',
    step: 'none',
  })
})

test('buildRecoveryGuidance: MISSING_STATE with and without a backup', () => {
  assert.deepEqual(buildRecoveryGuidance({ code: 'MISSING_STATE', slug: 's', backupCount: 1 }), {
    code: 'MISSING_STATE',
    why: 'state.json for s is missing (no snapshot on disk).',
    how: ['A rotating backup exists — restore the most recent healthy one.'],
    action: 'state.mjs rollback --slug s',
    step: 'rollback',
  })
  assert.deepEqual(buildRecoveryGuidance({ code: 'MISSING_STATE', slug: 's' }), {
    code: 'MISSING_STATE',
    why: 'state.json for s is missing (no snapshot on disk).',
    how: [
      'No backup exists — reconstruct a snapshot with conservative defaults.',
      'Infer the highest completed phase from on-disk artifacts, then confirm with the user before resuming.',
    ],
    action: 'state.mjs init --slug s',
    step: 'init',
  })
})

test('buildRecoveryGuidance: CORRUPTED_STATE with and without a backup or reason', () => {
  assert.deepEqual(buildRecoveryGuidance({ code: 'CORRUPTED_STATE', slug: 's', backupCount: 2, reason: 'bad token' }), {
    code: 'CORRUPTED_STATE',
    why: 'state.json for s is corrupted (invalid JSON): bad token',
    how: [
      'The corrupted file was snapshotted to state.json.corrupted.{ts} by the reader.',
      'Roll back to the most recent healthy backup.',
    ],
    action: 'state.mjs rollback --slug s',
    step: 'rollback',
  })
  assert.deepEqual(buildRecoveryGuidance({ code: 'CORRUPTED_STATE', slug: 's' }), {
    code: 'CORRUPTED_STATE',
    why: 'state.json for s is corrupted (invalid JSON).',
    how: [
      'The corrupted file was snapshotted to state.json.corrupted.{ts} by the reader.',
      'No backup is recoverable — reset to a fresh pipeline.',
      RECONSTRUCT,
    ],
    action: 'state.mjs reset --slug s',
    step: 'reset',
  })
})

test('buildRecoveryGuidance: INVALID_STATE with and without a backup or reason', () => {
  assert.deepEqual(buildRecoveryGuidance({ code: 'INVALID_STATE', slug: 's', backupCount: 1, reason: 'no phase' }), {
    code: 'INVALID_STATE',
    why: 'state.json for s fails schema validation: no phase',
    how: ['The recorded shape is invalid — roll back to the most recent healthy backup.'],
    action: 'state.mjs rollback --slug s',
    step: 'rollback',
  })
  assert.deepEqual(buildRecoveryGuidance({ code: 'INVALID_STATE', slug: 's' }), {
    code: 'INVALID_STATE',
    why: 'state.json for s fails schema validation.',
    how: [
      'The recorded shape is invalid and no backup is recoverable — reset to a fresh pipeline; the invalid file is kept as state.json.invalid.{ts}.',
      RECONSTRUCT,
    ],
    action: 'state.mjs reset --slug s',
    step: 'reset',
  })
})

test('buildRecoveryGuidance: STALE with and without a phase', () => {
  const how = [
    'Reset the phase retry counter so the phase agent can be relaunched.',
    'Then re-dispatch the phase and record a fresh verdict.',
  ]
  assert.deepEqual(buildRecoveryGuidance({ code: 'STALE', slug: 's', phase: 'DESIGN' }), {
    code: 'STALE',
    why: 'phase DESIGN for s is stale: its retry budget is exhausted and the verdict is not APPROVED, so the pipeline is stuck.',
    how,
    action: 'state.mjs resolve-stale --slug s --phase DESIGN',
    step: 'resolve-stale',
  })
  assert.deepEqual(buildRecoveryGuidance({ code: 'STALE', slug: 's' }), {
    code: 'STALE',
    why: 'phase the current phase for s is stale: its retry budget is exhausted and the verdict is not APPROVED, so the pipeline is stuck.',
    how,
    action: 'state.mjs resolve-stale --slug s',
    step: 'resolve-stale',
  })
})

test('recoveryStepOf: defaults to no backup', () => {
  assert.equal(recoveryStepOf({ code: 'MISSING_STATE' }), 'init')
  assert.equal(recoveryStepOf({ code: 'INVALID_STATE', backupCount: 1 }), 'rollback')
  assert.equal(recoveryStepOf({ code: 'UNKNOWN' }), 'halt')
})
