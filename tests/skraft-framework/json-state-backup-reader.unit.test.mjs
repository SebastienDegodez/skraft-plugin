import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createJsonStateBackupReader } from '../../plugins/src/adapters/infrastructure/state/json-state-backup-reader.mjs'

const mkBase = () => mkdtemp(join(tmpdir(), 'skraft-bakreader-'))

async function write(base, slug, name, content) {
  const dir = join(base, slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), content, 'utf8')
}

test('json-state-backup-reader: lists only bak.{ts} files, newest first, parsed', async () => {
  const base = await mkBase()
  try {
    await write(base, 'proj', 'state.json', '{"currentPhase":"DISCOVER"}')
    await write(base, 'proj', 'state.json.bak.100', '{"currentPhase":"DISCUSS"}')
    await write(base, 'proj', 'state.json.bak.300', '{"currentPhase":"DESIGN"}')
    await write(base, 'proj', 'state.json.bak.200', '{"currentPhase":"DISTILL"}')
    await write(base, 'proj', 'state.json.corrupted.999', '{}')

    const reader = createJsonStateBackupReader(base)
    const backups = await reader.list('proj')

    assert.deepEqual(backups.map((b) => b.name), [
      'state.json.bak.300', 'state.json.bak.200', 'state.json.bak.100',
    ])
    assert.equal(backups[0].timestamp, 300)
    assert.equal(backups[0].raw.currentPhase, 'DESIGN')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('json-state-backup-reader: unparseable backup → raw null (still listed)', async () => {
  const base = await mkBase()
  try {
    await write(base, 'proj', 'state.json.bak.500', 'not json')
    const reader = createJsonStateBackupReader(base)
    const backups = await reader.list('proj')
    assert.equal(backups.length, 1)
    assert.equal(backups[0].raw, null)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('json-state-backup-reader: missing project directory → empty list', async () => {
  const base = await mkBase()
  try {
    const reader = createJsonStateBackupReader(base)
    assert.deepEqual(await reader.list('nope'), [])
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})
