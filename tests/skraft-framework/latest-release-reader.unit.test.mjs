import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLatestReleaseReader } from '../../plugins/src/adapters/infrastructure/latest-release-reader.mjs'

const NOW = '2026-07-04T12:00:00Z'
const clock = { now: () => NOW }

// In-memory double of the update-check-store port.
const memStore = (initial = null) => {
  let data = initial
  return {
    read: async () => data,
    write: async (next) => { data = next },
    dump: () => data
  }
}

const fetchOk = (tag) => {
  const calls = []
  const impl = async (url) => {
    calls.push(url)
    return { ok: true, json: async () => ({ tag_name: tag }) }
  }
  return { impl, calls }
}

test('latest-release-reader: fetches the latest tag and persists it to the store', async () => {
  const store = memStore()
  const { impl, calls } = fetchOk('v1.3.0')
  const reader = createLatestReleaseReader({ store, fetchImpl: impl, clock })
  const latest = await reader.latestVersion()
  assert.equal(latest, 'v1.3.0')
  assert.equal(calls.length, 1)
  assert.ok(calls[0].includes('/releases/latest'))
  assert.deepEqual(store.dump(), { checkedAt: NOW, latestVersion: 'v1.3.0' })
})

test('latest-release-reader: a recent check skips the network entirely (daily default)', async () => {
  const store = memStore({ checkedAt: '2026-07-04T10:00:00Z', latestVersion: 'v1.2.0' })
  const { impl, calls } = fetchOk('v9.9.9')
  const reader = createLatestReleaseReader({ store, fetchImpl: impl, clock })
  assert.equal(await reader.latestVersion(), 'v1.2.0')
  assert.equal(calls.length, 0)
})

test('latest-release-reader: a check outside the window triggers a refetch', async () => {
  const store = memStore({ checkedAt: '2026-07-01T10:00:00Z', latestVersion: 'v1.2.0' })
  const { impl, calls } = fetchOk('v1.4.0')
  const reader = createLatestReleaseReader({ store, fetchImpl: impl, clock })
  assert.equal(await reader.latestVersion(), 'v1.4.0')
  assert.equal(calls.length, 1)
})

test('latest-release-reader: frequency never disables the network and reports the stored value', async () => {
  const store = memStore({ checkedAt: '2026-01-01T00:00:00Z', latestVersion: 'v1.2.0' })
  const { impl, calls } = fetchOk('v9.9.9')
  const reader = createLatestReleaseReader({ store, frequency: 'never', fetchImpl: impl, clock })
  assert.equal(await reader.latestVersion(), 'v1.2.0')
  assert.equal(calls.length, 0)
})

test('latest-release-reader: frequency every_session refetches even after a recent check', async () => {
  const store = memStore({ checkedAt: '2026-07-04T11:59:00Z', latestVersion: 'v1.2.0' })
  const { impl, calls } = fetchOk('v1.5.0')
  const reader = createLatestReleaseReader({ store, frequency: 'every_session', fetchImpl: impl, clock })
  assert.equal(await reader.latestVersion(), 'v1.5.0')
  assert.equal(calls.length, 1)
})

test('latest-release-reader: network failure fails open with null and still stamps the store', async () => {
  const store = memStore()
  const reader = createLatestReleaseReader({
    store,
    fetchImpl: async () => { throw new Error('offline') },
    clock
  })
  assert.equal(await reader.latestVersion(), null)
  assert.deepEqual(store.dump(), { checkedAt: NOW, latestVersion: null })
})

test('latest-release-reader: non-200 response fails open with the stored value', async () => {
  const store = memStore({ checkedAt: '2026-07-01T10:00:00Z', latestVersion: 'v1.1.0' })
  const reader = createLatestReleaseReader({
    store,
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
    clock
  })
  assert.equal(await reader.latestVersion(), 'v1.1.0')
  assert.deepEqual(store.dump(), { checkedAt: NOW, latestVersion: 'v1.1.0' })
})
