import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createExecutionLogService } from '../../plugins/src/application/execution-log-service.mjs'
import { Ok, Err } from '../../plugins/src/domain/result.mjs'

const TS = '2026-07-12T20:54:18.931Z'

// ─── Test doubles ─────────────────────────────────────────────────────────────
const clock = { now: () => new Date(TS), isoString: () => TS }

const readerOk = (log) => ({ read: async () => log })
const readerEnoent = () => ({
  read: async () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e },
})
const readerCorrupted = () => ({
  read: async () => { const e = new Error('bad json'); e.code = 'CORRUPTED_LOG'; throw e },
})
const readerIoError = () => ({
  read: async () => { const e = new Error('disk failure'); e.code = 'EIO'; throw e },
})

const writerOk = () => {
  const written = {}
  return {
    write: async (slug, log) => { written[slug] = log; return Ok(undefined) },
    _written: written,
  }
}
const writerFail = () => ({ write: async () => Err({ code: 'IO_ERROR', reason: 'disk full' }) })

const emptyLog = (slug = 'us9') => ({ slug, createdAt: TS, entries: [] })

// ─── init ─────────────────────────────────────────────────────────────────────
test('init: creates an empty log on ENOENT, created=true', async () => {
  const writer = writerOk()
  const svc = createExecutionLogService({ logReader: readerEnoent(), logWriter: writer, clock })
  const r = await svc.init('us9')
  assert.equal(r.ok, true)
  assert.equal(r.value.created, true)
  assert.equal(r.value.slug, 'us9')
  assert.equal(writer._written.us9.createdAt, TS)
  assert.deepEqual(writer._written.us9.entries, [])
})

test('init: idempotent — returns existing log with created=false', async () => {
  const svc = createExecutionLogService({ logReader: readerOk(emptyLog()), logWriter: writerOk(), clock })
  const r = await svc.init('us9')
  assert.equal(r.ok, true)
  assert.equal(r.value.created, false)
})

test('init: surfaces corrupted log', async () => {
  const svc = createExecutionLogService({ logReader: readerCorrupted(), logWriter: writerOk(), clock })
  const r = await svc.init('us9')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'CORRUPTED_LOG')
})

test('init: propagates IO error', async () => {
  const svc = createExecutionLogService({ logReader: readerIoError(), logWriter: writerOk(), clock })
  const r = await svc.init('us9')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

test('init: propagates writer failure on create', async () => {
  const svc = createExecutionLogService({ logReader: readerEnoent(), logWriter: writerFail(), clock })
  const r = await svc.init('us9')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

// ─── logPhase ─────────────────────────────────────────────────────────────────
test('logPhase: appends a real-UTC-timestamped entry and persists', async () => {
  const writer = writerOk()
  const svc = createExecutionLogService({ logReader: readerOk(emptyLog()), logWriter: writer, clock })
  const r = await svc.logPhase('us9', { step: '1', phase: 'RED' })
  assert.equal(r.ok, true)
  assert.deepEqual(r.value, { step: '1', phase: 'RED', timestamp: TS })
  assert.equal(writer._written.us9.entries.length, 1)
  assert.equal(writer._written.us9.entries[0].timestamp, TS)
})

test('logPhase: keeps an optional note', async () => {
  const writer = writerOk()
  const svc = createExecutionLogService({ logReader: readerOk(emptyLog()), logWriter: writer, clock })
  const r = await svc.logPhase('us9', { step: '1', phase: 'RED', note: 'failing test' })
  assert.equal(r.ok, true)
  assert.equal(r.value.note, 'failing test')
})

test('logPhase: auto-inits an empty log on ENOENT before appending', async () => {
  const writer = writerOk()
  const svc = createExecutionLogService({ logReader: readerEnoent(), logWriter: writer, clock })
  const r = await svc.logPhase('us9', { step: '1', phase: 'RED' })
  assert.equal(r.ok, true)
  assert.equal(writer._written.us9.entries.length, 1)
})

test('logPhase: rejects an invalid phase', async () => {
  const svc = createExecutionLogService({ logReader: readerOk(emptyLog()), logWriter: writerOk(), clock })
  const r = await svc.logPhase('us9', { step: '1', phase: 'NOPE' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_ENTRY')
})

test('logPhase: propagates writer failure', async () => {
  const svc = createExecutionLogService({ logReader: readerOk(emptyLog()), logWriter: writerFail(), clock })
  const r = await svc.logPhase('us9', { step: '1', phase: 'RED' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

test('logPhase: surfaces corrupted log', async () => {
  const svc = createExecutionLogService({ logReader: readerCorrupted(), logWriter: writerOk(), clock })
  const r = await svc.logPhase('us9', { step: '1', phase: 'RED' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'CORRUPTED_LOG')
})

// ─── verifyIntegrity ──────────────────────────────────────────────────────────
const full = (step) => ['RED', 'GREEN', 'REFACTOR', 'COMMIT'].map((phase) => ({ step, phase, timestamp: TS }))

test('verifyIntegrity: Ok when every step is complete', async () => {
  const svc = createExecutionLogService({
    logReader: readerOk({ slug: 'us9', createdAt: TS, entries: full('1') }),
    logWriter: writerOk(),
    clock,
  })
  const r = await svc.verifyIntegrity('us9')
  assert.equal(r.ok, true)
  assert.equal(r.value.complete, true)
})

test('verifyIntegrity: Err when a step is missing phases', async () => {
  const svc = createExecutionLogService({
    logReader: readerOk({ slug: 'us9', createdAt: TS, entries: [{ step: '1', phase: 'RED', timestamp: TS }] }),
    logWriter: writerOk(),
    clock,
  })
  const r = await svc.verifyIntegrity('us9')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INCOMPLETE_LOG')
})

test('verifyIntegrity: Err INCOMPLETE_LOG when no log exists (ENOENT)', async () => {
  const svc = createExecutionLogService({ logReader: readerEnoent(), logWriter: writerOk(), clock })
  const r = await svc.verifyIntegrity('us9')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INCOMPLETE_LOG')
  assert.deepEqual(r.error.incomplete, [])
})

test('verifyIntegrity: propagates IO error', async () => {
  const svc = createExecutionLogService({ logReader: readerIoError(), logWriter: writerOk(), clock })
  const r = await svc.verifyIntegrity('us9')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})
