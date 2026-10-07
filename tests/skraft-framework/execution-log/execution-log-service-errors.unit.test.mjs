import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createExecutionLogService } from '../../../plugins/skraft-framework/src/application/execution-log-service.mjs'
import { Ok } from '../../../plugins/skraft-framework/src/domain/result.mjs'

const TS = '2026-07-12T20:54:18.931Z'
const clock = { isoString: () => TS }

const throwing = (code, message) => ({ read: async () => { const e = new Error(message); e.code = code; throw e } })
const returning = (value) => ({ read: async () => value })
const recordingWriter = () => {
  const writes = []
  return { writes, write: async (slug, log) => { writes.push([slug, log]); return Ok(undefined) } }
}

test('init: a corrupted log is reported with the reader message', async () => {
  const writer = recordingWriter()
  const svc = createExecutionLogService({ logReader: throwing('CORRUPTED_LOG', 'Unexpected token'), logWriter: writer, clock })
  assert.deepEqual(await svc.init('us9'), { ok: false, error: { code: 'CORRUPTED_LOG', reason: 'Unexpected token' } })
  assert.deepEqual(writer.writes, [])
})

test('init: a stored log of the wrong shape is reported as corrupted with the schema reason', async () => {
  const svc = createExecutionLogService({ logReader: returning([]), logWriter: recordingWriter(), clock })
  assert.deepEqual(await svc.init('us9'), {
    ok: false,
    error: { code: 'CORRUPTED_LOG', reason: 'execution log must be an object' },
  })
})

test('logPhase: an IO error is returned as is and nothing is written', async () => {
  const writer = recordingWriter()
  const svc = createExecutionLogService({ logReader: throwing('EACCES', 'permission denied'), logWriter: writer, clock })
  assert.deepEqual(await svc.logPhase('us9', { step: 's1', phase: 'RED' }), {
    ok: false,
    error: { code: 'IO_ERROR', reason: 'permission denied' },
  })
  assert.deepEqual(writer.writes, [])
})

test('logPhase: a stored log of the wrong shape is reported as corrupted and nothing is written', async () => {
  const writer = recordingWriter()
  const svc = createExecutionLogService({ logReader: returning({ slug: 'us9', createdAt: TS, entries: 'x' }), logWriter: writer, clock })
  assert.deepEqual(await svc.logPhase('us9', { step: 's1', phase: 'RED' }), {
    ok: false,
    error: { code: 'CORRUPTED_LOG', reason: 'execution log entries must be an array' },
  })
  assert.deepEqual(writer.writes, [])
})

test('verifyIntegrity: a missing log names the project', async () => {
  const svc = createExecutionLogService({ logReader: throwing('ENOENT', 'nope'), logWriter: recordingWriter(), clock })
  assert.deepEqual(await svc.verifyIntegrity('us9'), {
    ok: false,
    error: { code: 'INCOMPLETE_LOG', reason: 'no execution log found for us9', incomplete: [] },
  })
})
