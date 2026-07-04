import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUpdateCheckStore } from '../../plugins/src/adapters/infrastructure/update-check-store.mjs'

const tmpStorePath = () => join(mkdtempSync(join(tmpdir(), 'skraft-update-')), 'update-check.json')

// read ————————————————————————————————————————————————————————————————

test('read: null when the store file does not exist', async () => {
  const store = createUpdateCheckStore({ storePath: tmpStorePath() })
  assert.equal(await store.read(), null)
})

test('read: null when the store file is corrupt (fail-open, ADR-006)', async () => {
  const storePath = tmpStorePath()
  writeFileSync(storePath, '{not json')
  const store = createUpdateCheckStore({ storePath })
  assert.equal(await store.read(), null)
})

// write → read roundtrip ——————————————————————————————————————————————

test('write then read: returns the persisted checkedAt and latestVersion', async () => {
  const store = createUpdateCheckStore({ storePath: tmpStorePath() })
  await store.write({ checkedAt: '2026-07-04T09:00:00Z', latestVersion: 'v1.2.0' })
  assert.deepEqual(await store.read(), {
    checkedAt: '2026-07-04T09:00:00Z',
    latestVersion: 'v1.2.0'
  })
})

test('write: creates missing parent directories', async () => {
  const storePath = join(mkdtempSync(join(tmpdir(), 'skraft-update-')), 'nested', 'deep', 'update-check.json')
  const store = createUpdateCheckStore({ storePath })
  await store.write({ checkedAt: '2026-07-04T09:00:00Z', latestVersion: null })
  assert.deepEqual(await store.read(), { checkedAt: '2026-07-04T09:00:00Z', latestVersion: null })
})

// best-effort write ———————————————————————————————————————————————————

test('write: never throws when the path is unwritable (best-effort)', async () => {
  const store = createUpdateCheckStore({ storePath: '/dev/null/impossible/update-check.json' })
  await assert.doesNotReject(store.write({ checkedAt: '2026-07-04T09:00:00Z', latestVersion: 'v1.2.0' }))
})
