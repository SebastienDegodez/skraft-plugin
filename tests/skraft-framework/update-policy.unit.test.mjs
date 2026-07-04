import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareSemver,
  isStale,
  shouldCheck,
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

// shouldCheck (frequency policy) —————————————————————————————————

test('shouldCheck: never wins over everything, even the first run', () => {
  assert.equal(shouldCheck({ frequency: 'never', checkedAt: undefined, now: '2026-07-04T09:00:00Z' }), false)
  assert.equal(shouldCheck({ frequency: 'never', checkedAt: '2026-01-01T00:00:00Z', now: '2026-07-04T09:00:00Z' }), false)
})

test('shouldCheck: first run (no previous check) always checks', () => {
  assert.equal(shouldCheck({ frequency: 'daily', checkedAt: undefined, now: '2026-07-04T09:00:00Z' }), true)
  assert.equal(shouldCheck({ frequency: 'weekly', checkedAt: null, now: '2026-07-04T09:00:00Z' }), true)
})

test('shouldCheck: every_session always checks even inside the window', () => {
  assert.equal(
    shouldCheck({ frequency: 'every_session', checkedAt: '2026-07-04T08:59:00Z', now: '2026-07-04T09:00:00Z' }),
    true
  )
})

test('shouldCheck: daily skips inside the 24h window, checks outside', () => {
  assert.equal(shouldCheck({ frequency: 'daily', checkedAt: '2026-07-04T08:00:00Z', now: '2026-07-04T20:00:00Z' }), false)
  assert.equal(shouldCheck({ frequency: 'daily', checkedAt: '2026-07-03T08:00:00Z', now: '2026-07-04T09:00:00Z' }), true)
})

test('shouldCheck: weekly skips inside the 168h window, checks outside', () => {
  assert.equal(shouldCheck({ frequency: 'weekly', checkedAt: '2026-07-01T08:00:00Z', now: '2026-07-04T09:00:00Z' }), false)
  assert.equal(shouldCheck({ frequency: 'weekly', checkedAt: '2026-06-26T08:00:00Z', now: '2026-07-04T09:00:00Z' }), true)
})

test('shouldCheck: defaults to daily when frequency is absent or unknown', () => {
  assert.equal(shouldCheck({ checkedAt: '2026-07-04T08:00:00Z', now: '2026-07-04T20:00:00Z' }), false)
  assert.equal(shouldCheck({ frequency: 'hourly', checkedAt: '2026-07-03T08:00:00Z', now: '2026-07-04T09:00:00Z' }), true)
})

test('shouldCheck: unparseable checkedAt fails open to a check', () => {
  assert.equal(shouldCheck({ frequency: 'daily', checkedAt: 'not-a-date', now: '2026-07-04T09:00:00Z' }), true)
})

// staleNotice —————————————————————————————————————————————————————————

test('staleNotice: one line naming both versions and the native update command', () => {
  const notice = staleNotice({ installed: '1.0.0', latest: 'v1.2.0' })
  assert.equal(notice.split('\n').length, 1)
  assert.ok(notice.includes('1.2.0'))
  assert.ok(notice.includes('1.0.0'))
  assert.ok(notice.includes('claude plugin update'))
})
