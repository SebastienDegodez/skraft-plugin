import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRecoveryService } from '../../../plugins/skraft-framework/src/application/recovery-service.mjs'
import { Ok } from '../../../plugins/skraft-framework/src/domain/result.mjs'

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

const failing = (code, message = code) => async () => { const e = new Error(message); e.code = code; throw e }
const reader = (read) => ({ read })
const writer = () => ({ write: async () => Ok(undefined) })
const backups = (list) => ({ list: async () => list })
const failingBackups = (message) => ({ list: async () => { throw new Error(message) } })
const noStateService = { applyEvent: async () => Ok({}), reinitialize: async () => Ok({}) }
const noArchive = { setAside: async () => Ok(undefined) }

const service = (overrides) => createRecoveryService({
  stateReader: reader(async () => validState()),
  stateWriter: writer(),
  backupReader: backups([]),
  stateArchive: noArchive,
  stateService: noStateService,
  ...overrides,
})

test('diagnose: only schema-valid backups count towards a rollback', async () => {
  const svc = service({
    stateReader: reader(failing('ENOENT')),
    backupReader: backups([{ name: 'state.json.bak.1', timestamp: 1, raw: { currentPhase: 42 } }]),
  })
  const result = await svc.diagnose('demo')
  assert.equal(result.value.code, 'MISSING_STATE')
  assert.equal(result.value.action, 'state.mjs init --slug demo')
  assert.equal(result.value.step, 'init')
})

test('diagnose: an unlistable backup directory counts as no backup', async () => {
  const svc = service({ stateReader: reader(failing('CORRUPTED_STATE', 'bad json')), backupReader: failingBackups('EACCES') })
  const result = await svc.diagnose('demo')
  assert.equal(result.value.code, 'CORRUPTED_STATE')
  assert.equal(result.value.action, 'state.mjs reset --slug demo')
})

test('diagnose: an IO error names the project and the reason', async () => {
  const svc = service({ stateReader: reader(failing('EIO', 'disk failure')) })
  const result = await svc.diagnose('demo')
  assert.deepEqual(result.value, {
    code: 'IO_ERROR',
    why: 'state.json for demo could not be read: disk failure',
    how: ['Check filesystem permissions and disk availability, then retry the read.'],
    action: 'state.mjs get --slug demo',
    step: 'halt',
  })
})

test('rollback: a failed backup listing is an IO error with its reason', async () => {
  const result = await service({ backupReader: failingBackups('EACCES') }).rollback('demo')
  assert.deepEqual(result, { ok: false, error: { code: 'IO_ERROR', reason: 'failed to list backups for demo: EACCES' } })
})

test('rollback: no healthy backup names the way out', async () => {
  const result = await service({ backupReader: backups([]) }).rollback('demo')
  assert.deepEqual(result.error, {
    code: 'NO_BACKUP',
    reason: "no healthy backup found for demo; start over with 'reset' ('init' when state.json is missing)",
  })
})

test('reset: a missing state names init', async () => {
  const result = await service({ stateReader: reader(failing('ENOENT')) }).reset('demo')
  assert.deepEqual(result.error, { code: 'NO_STATE', reason: "demo has no state.json; create it with 'init'" })
})

test('reset: a valid state is refused with its reason', async () => {
  const result = await service({}).reset('demo')
  assert.deepEqual(result.error, { code: 'NOT_INVALID', reason: 'state.json for demo is valid; nothing to reset' })
})
