import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareSemver,
  isStale,
  shouldRefreshCache,
  staleNotice
} from '../../plugins/src/domain/update-policy.mjs'

// compareSemver ———————————————————————————————————————————————————————

test('compareSemver: equal versions return 0', () => {
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0)
})

test('compareSemver: orders by major, minor then patch', () => {
  assert.equal(compareSemver('1.0.0', '2.0.0'), -1)
  assert.equal(compareSemver('1.3.0', '1.2.9'), 1)
  assert.equal(compareSemver('1.2.3', '1.2.4'), -1)
})

test('compareSemver: tolerates a leading v prefix', () => {
  assert.equal(compareSemver('v1.2.3', '1.2.3'), 0)
  assert.equal(compareSemver('1.3.0', 'v1.2.0'), 1)
})

// isStale —————————————————————————————————————————————————————————————

test('isStale: true when latest is greater than installed', () => {
  assert.equal(isStale({ installed: '1.0.0', latest: 'v1.1.0' }), true)
})

test('isStale: false when versions are equal or installed is ahead', () => {
  assert.equal(isStale({ installed: '1.1.0', latest: '1.1.0' }), false)
  assert.equal(isStale({ installed: '1.2.0', latest: '1.1.0' }), false)
})

test('isStale: false when latest is unknown (fail-open, ADR-006)', () => {
  assert.equal(isStale({ installed: '1.0.0', latest: null }), false)
  assert.equal(isStale({ installed: '1.0.0', latest: undefined }), false)
})

// shouldRefreshCache ——————————————————————————————————————————————————

test('shouldRefreshCache: false when checked less than the TTL ago', () => {
  assert.equal(
    shouldRefreshCache({ checkedAt: '2026-07-04T08:00:00Z', now: '2026-07-04T20:00:00Z' }),
    false
  )
})

test('shouldRefreshCache: true when the last check is older than 24h', () => {
  assert.equal(
    shouldRefreshCache({ checkedAt: '2026-07-03T08:00:00Z', now: '2026-07-04T09:00:00Z' }),
    true
  )
})

test('shouldRefreshCache: true when no previous check exists', () => {
  assert.equal(shouldRefreshCache({ checkedAt: undefined, now: '2026-07-04T09:00:00Z' }), true)
})

test('shouldRefreshCache: honours a custom ttlHours', () => {
  assert.equal(
    shouldRefreshCache({ checkedAt: '2026-07-04T08:00:00Z', now: '2026-07-04T10:00:00Z', ttlHours: 1 }),
    true
  )
})

// staleNotice —————————————————————————————————————————————————————————

test('staleNotice: one line naming both versions and the native update command', () => {
  const notice = staleNotice({ installed: '1.0.0', latest: 'v1.2.0' })
  assert.equal(notice.split('\n').length, 1)
  assert.ok(notice.includes('1.2.0'))
  assert.ok(notice.includes('1.0.0'))
  assert.ok(notice.includes('claude plugin update'))
})
