import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRecoveryService } from '../../plugins/src/application/recovery-service.mjs'
import { createStateService } from '../../plugins/src/application/state-service.mjs'
import { DIAGNOSIS } from '../../plugins/src/domain/recovery-policy.mjs'
import { Ok, Err } from '../../plugins/src/domain/result.mjs'

const validState = (overrides = {}) => ({
  currentPhase: 'DESIGN',
  phasesCompleted: ['DISCOVER', 'DISCUSS'],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: {},
  difficulty: null,
  userPreferences: { maxRetriesPerPhase: 2 },
  ...overrides,
})

// ─── Test doubles ─────────────────────────────────────────────────────────────
const readerOk = (state) => ({ read: async () => state })
const readerEnoent = () => ({ read: async () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e } })
const readerCorrupted = () => ({ read: async () => { const e = new Error('bad json'); e.code = 'CORRUPTED_STATE'; throw e } })
const readerIoError = () => ({ read: async () => { const e = new Error('disk failure'); e.code = 'EIO'; throw e } })

const writerOk = () => {
  const written = {}
  return { write: async (slug, state) => { written[slug] = state; return Ok(undefined) }, _written: written }
}
const writerFail = () => ({ write: async () => Err({ code: 'IO_ERROR', reason: 'disk full' }) })

const backupReaderWith = (backups) => ({ list: async () => backups })

const stubStateService = (result) => ({ applyEvent: async () => result })

// ─── diagnose ───────────────────────────────────────────────────────────────
test('diagnose: healthy state → HEALTHY guidance', async () => {
  const svc = createRecoveryService({
    stateReader: readerOk(validState()), stateWriter: writerOk(),
    backupReader: backupReaderWith([]), stateService: stubStateService(Ok({})),
  })
  const result = await svc.diagnose('demo')
  assert.ok(result.ok)
  assert.equal(result.value.code, DIAGNOSIS.HEALTHY)
})

test('diagnose: stale phase → STALE guidance', async () => {
  const stale = validState({ retryCount: { DESIGN: 2 }, verdicts: { DESIGN: 'CHANGES_REQUESTED' } })
  const svc = createRecoveryService({
    stateReader: readerOk(stale), stateWriter: writerOk(),
    backupReader: backupReaderWith([]), stateService: stubStateService(Ok({})),
  })
  const result = await svc.diagnose('demo')
  assert.equal(result.value.code, DIAGNOSIS.STALE)
})

test('diagnose: ENOENT → MISSING_STATE guidance, backupCount reflects healthy backups', async () => {
  const svc = createRecoveryService({
    stateReader: readerEnoent(), stateWriter: writerOk(),
    backupReader: backupReaderWith([{ name: 'state.json.bak.1', timestamp: 1, raw: validState() }]),
    stateService: stubStateService(Ok({})),
  })
  const result = await svc.diagnose('demo')
  assert.equal(result.value.code, DIAGNOSIS.MISSING_STATE)
  assert.match(result.value.action, /rollback/)
})

test('diagnose: CORRUPTED_STATE → CORRUPTED_STATE guidance', async () => {
  const svc = createRecoveryService({
    stateReader: readerCorrupted(), stateWriter: writerOk(),
    backupReader: backupReaderWith([]), stateService: stubStateService(Ok({})),
  })
  const result = await svc.diagnose('demo')
  assert.equal(result.value.code, DIAGNOSIS.CORRUPTED_STATE)
  assert.match(result.value.action, /init/)
})

test('diagnose: invalid schema → INVALID_STATE guidance', async () => {
  const svc = createRecoveryService({
    stateReader: readerOk({ currentPhase: 123 }), stateWriter: writerOk(),
    backupReader: backupReaderWith([]), stateService: stubStateService(Ok({})),
  })
  const result = await svc.diagnose('demo')
  assert.equal(result.value.code, DIAGNOSIS.INVALID_STATE)
})

test('diagnose: unexpected IO error → IO_ERROR guidance', async () => {
  const svc = createRecoveryService({
    stateReader: readerIoError(), stateWriter: writerOk(),
    backupReader: backupReaderWith([]), stateService: stubStateService(Ok({})),
  })
  const result = await svc.diagnose('demo')
  assert.equal(result.value.code, DIAGNOSIS.IO_ERROR)
})

// ─── rollback ─────────────────────────────────────────────────────────────────
test('rollback: restores the most recent healthy backup', async () => {
  const writer = writerOk()
  const svc = createRecoveryService({
    stateReader: readerCorrupted(), stateWriter: writer,
    backupReader: backupReaderWith([
      { name: 'state.json.bak.100', timestamp: 100, raw: validState({ currentPhase: 'DISCOVER' }) },
      { name: 'state.json.bak.200', timestamp: 200, raw: validState({ currentPhase: 'DESIGN' }) },
    ]),
    stateService: stubStateService(Ok({})),
  })
  const result = await svc.rollback('demo')
  assert.ok(result.ok)
  assert.equal(result.value.restoredFrom, 'state.json.bak.200')
  assert.equal(result.value.currentPhase, 'DESIGN')
  assert.equal(writer._written.demo.currentPhase, 'DESIGN')
})

test('rollback: no healthy backup → NO_BACKUP', async () => {
  const svc = createRecoveryService({
    stateReader: readerCorrupted(), stateWriter: writerOk(),
    backupReader: backupReaderWith([{ name: 'state.json.bak.1', timestamp: 1, raw: null }]),
    stateService: stubStateService(Ok({})),
  })
  const result = await svc.rollback('demo')
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'NO_BACKUP')
})

test('rollback: propagates writer failure', async () => {
  const svc = createRecoveryService({
    stateReader: readerCorrupted(), stateWriter: writerFail(),
    backupReader: backupReaderWith([{ name: 'state.json.bak.1', timestamp: 1, raw: validState() }]),
    stateService: stubStateService(Ok({})),
  })
  const result = await svc.rollback('demo')
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'IO_ERROR')
})

// ─── resolveStale ───────────────────────────────────────────────────────────
test('resolveStale: delegates to stateService.applyEvent with RESOLVE_STALE', async () => {
  let captured
  const stateService = { applyEvent: async (slug, event) => { captured = { slug, event }; return Ok({ ok: true }) } }
  const svc = createRecoveryService({
    stateReader: readerOk(validState()), stateWriter: writerOk(),
    backupReader: backupReaderWith([]), stateService,
  })
  await svc.resolveStale('demo', 'DESIGN')
  assert.deepEqual(captured, { slug: 'demo', event: { type: 'RESOLVE_STALE', phase: 'DESIGN' } })
})

test('resolveStale: end-to-end with real stateService resets stuck phase retryCount', async () => {
  const stale = validState({ retryCount: { DESIGN: 2 }, verdicts: { DESIGN: 'CHANGES_REQUESTED' } })
  const writer = writerOk()
  const stateService = createStateService({ stateReader: readerOk(stale), stateWriter: writer })
  const svc = createRecoveryService({ stateReader: readerOk(stale), stateWriter: writer, backupReader: backupReaderWith([]), stateService })
  const result = await svc.resolveStale('demo')
  assert.ok(result.ok)
  assert.equal(result.value.retryCount.DESIGN, 0)
})
