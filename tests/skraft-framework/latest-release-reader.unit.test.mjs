import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLatestReleaseReader } from '../../plugins/src/adapters/infrastructure/latest-release-reader.mjs'

const NOW = '2026-07-04T12:00:00Z'
const clock = { now: () => NOW }

const tmpCache = () => join(mkdtempSync(join(tmpdir(), 'skraft-upd-')), 'update-check.json')

const fetchOk = (tag) => {
  const calls = []
  const impl = async (url) => {
    calls.push(url)
    return { ok: true, json: async () => ({ tag_name: tag }) }
  }
  return { impl, calls }
}

test('latest-release-reader: fetches the latest tag and writes the cache', async () => {
  const cachePath = tmpCache()
  const { impl, calls } = fetchOk('v1.3.0')
  const reader = createLatestReleaseReader({ cachePath, fetchImpl: impl, clock })
  const latest = await reader.latestVersion()
  assert.equal(latest, 'v1.3.0')
  assert.equal(calls.length, 1)
  assert.ok(calls[0].includes('/releases/latest'))
  const cache = JSON.parse(readFileSync(cachePath, 'utf8'))
  assert.equal(cache.latestVersion, 'v1.3.0')
  assert.equal(cache.checkedAt, NOW)
})

test('latest-release-reader: a fresh cache skips the network entirely', async () => {
  const cachePath = tmpCache()
  writeFileSync(cachePath, JSON.stringify({ checkedAt: '2026-07-04T10:00:00Z', latestVersion: 'v1.2.0' }))
  const { impl, calls } = fetchOk('v9.9.9')
  const reader = createLatestReleaseReader({ cachePath, fetchImpl: impl, clock })
  const latest = await reader.latestVersion()
  assert.equal(latest, 'v1.2.0')
  assert.equal(calls.length, 0)
})

test('latest-release-reader: a stale cache triggers a refetch', async () => {
  const cachePath = tmpCache()
  writeFileSync(cachePath, JSON.stringify({ checkedAt: '2026-07-01T10:00:00Z', latestVersion: 'v1.2.0' }))
  const { impl, calls } = fetchOk('v1.4.0')
  const reader = createLatestReleaseReader({ cachePath, fetchImpl: impl, clock })
  assert.equal(await reader.latestVersion(), 'v1.4.0')
  assert.equal(calls.length, 1)
})

test('latest-release-reader: network failure fails open with null and still stamps the cache', async () => {
  const cachePath = tmpCache()
  const reader = createLatestReleaseReader({
    cachePath,
    fetchImpl: async () => { throw new Error('offline') },
    clock
  })
  assert.equal(await reader.latestVersion(), null)
  const cache = JSON.parse(readFileSync(cachePath, 'utf8'))
  assert.equal(cache.checkedAt, NOW)
})

test('latest-release-reader: non-200 response fails open with the cached value', async () => {
  const cachePath = tmpCache()
  writeFileSync(cachePath, JSON.stringify({ checkedAt: '2026-07-01T10:00:00Z', latestVersion: 'v1.1.0' }))
  const reader = createLatestReleaseReader({
    cachePath,
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
    clock
  })
  assert.equal(await reader.latestVersion(), 'v1.1.0')
})

test('latest-release-reader: creates the cache directory when missing', async () => {
  const cachePath = join(mkdtempSync(join(tmpdir(), 'skraft-upd-')), 'nested', 'update-check.json')
  const { impl } = fetchOk('v1.0.1')
  const reader = createLatestReleaseReader({ cachePath, fetchImpl: impl, clock })
  await reader.latestVersion()
  assert.ok(existsSync(cachePath))
})
