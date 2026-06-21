import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createNullAuditWriter } from '../../plugins/src/adapters/infrastructure/null-audit-writer.mjs'
import { createJsonlAuditWriter } from '../../plugins/src/adapters/infrastructure/jsonl-audit-writer.mjs'
import { readFile, rm, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('AC3: null-audit-writer absorbs writes without side effects', async () => {
  const writer = createNullAuditWriter()
  await assert.doesNotReject(() => writer.write({ phase: 'DISCOVER', ts: 1 }))
})

test('AC3: jsonl-audit-writer writes two entries as two valid JSONL lines (append-only)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-fw-'))
  const filePath = join(dir, 'audit.jsonl')

  const writer = createJsonlAuditWriter(filePath)
  await writer.write({ phase: 'DISCOVER', verdict: 'APPROVED' })
  await writer.write({ phase: 'DISCUSS', verdict: 'APPROVED' })

  const content = await readFile(filePath, 'utf8')
  const lines = content.trim().split('\n')
  assert.equal(lines.length, 2, 'append-only: must have exactly 2 lines')

  const first = JSON.parse(lines[0])
  const second = JSON.parse(lines[1])
  assert.equal(first.phase, 'DISCOVER')
  assert.equal(second.phase, 'DISCUSS')

  await rm(dir, { recursive: true, force: true })
})

test('AC3: null-audit-writer and jsonl-audit-writer share the same interface', () => {
  const nullWriter = createNullAuditWriter()
  const jsonlWriter = createJsonlAuditWriter('/dev/null')
  assert.equal(typeof nullWriter.write, 'function')
  assert.equal(typeof jsonlWriter.write, 'function')
})
