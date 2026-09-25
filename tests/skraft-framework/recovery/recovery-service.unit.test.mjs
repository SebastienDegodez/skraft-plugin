import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRecoveryService } from '../../../plugins/skraft-framework/src/application/recovery-service.mjs'
import { createStateService } from '../../../plugins/skraft-framework/src/application/state-service.mjs'
import { DIAGNOSIS } from '../../../plugins/skraft-framework/src/domain/recovery-policy.mjs'
import { Ok, Err } from '../../../plugins/skraft-framework/src/domain/result.mjs'

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
  assert.match(result.value.action, /reset/)
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

// ─── reset ────────────────────────────────────────────────────────────────────
const archiveRecording = () => {
  const kept = []
  return { setAside: async (slug) => { kept.push(slug); return Ok('state.json.invalid.1') }, kept }
}
const resetService = ({ stateReader, stateArchive = archiveRecording(), writer = writerOk() }) => {
  const stateService = createStateService({ stateReader, stateWriter: writer, phaseOrder: ['RESEARCH', 'DESIGN'] })
  return createRecoveryService({ stateReader, stateWriter: writer, backupReader: backupReaderWith([]), stateArchive, stateService })
}

test('reset: an invalid state is kept aside, then replaced by a fresh pipeline', async () => {
  const archive = archiveRecording()
  const writer = writerOk()
  const svc = resetService({ stateReader: readerOk({ currentPhase: 42 }), stateArchive: archive, writer })
  const result = await svc.reset('demo')
  assert.ok(result.ok)
  assert.deepEqual(archive.kept, ['demo'])
  assert.equal(writer._written.demo.currentPhase, 'RESEARCH')
  assert.equal(writer._written.demo.projectSlug, 'demo')
})

test('reset: invalid JSON is replaced without a second copy (the reader kept it)', async () => {
  const archive = archiveRecording()
  const writer = writerOk()
  const svc = resetService({ stateReader: readerCorrupted(), stateArchive: archive, writer })
  const result = await svc.reset('demo')
  assert.ok(result.ok)
  assert.deepEqual(archive.kept, [])
  assert.equal(writer._written.demo.currentPhase, 'RESEARCH')
})

test('reset: a valid state is refused with NOT_INVALID and left untouched', async () => {
  const writer = writerOk()
  const svc = resetService({ stateReader: readerOk(validState()), writer })
  const result = await svc.reset('demo')
  assert.equal(result.error.code, 'NOT_INVALID')
  assert.deepEqual(writer._written, {})
})

test('reset: a missing state is refused with NO_STATE', async () => {
  const result = await resetService({ stateReader: readerEnoent() }).reset('demo')
  assert.equal(result.error.code, 'NO_STATE')
})

test('reset: an unreadable state is reported as IO_ERROR', async () => {
  const result = await resetService({ stateReader: readerIoError() }).reset('demo')
  assert.equal(result.error.code, 'IO_ERROR')
})

test('reset: nothing is written when the invalid state cannot be kept', async () => {
  const writer = writerOk()
  const failing = { setAside: async () => Err({ code: 'IO_ERROR', reason: 'read-only' }) }
  const result = await resetService({ stateReader: readerOk({ currentPhase: 42 }), stateArchive: failing, writer }).reset('demo')
  assert.equal(result.error.code, 'IO_ERROR')
  assert.deepEqual(writer._written, {})
})

test('reset: a writer failure is propagated', async () => {
  const result = await resetService({ stateReader: readerOk({ currentPhase: 42 }), writer: writerFail() }).reset('demo')
  assert.equal(result.error.code, 'IO_ERROR')
})
