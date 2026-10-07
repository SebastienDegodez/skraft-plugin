import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isDestinationSelected, configuredTarget, scopedReceipt,
} from '../../../plugins/skraft-framework/src/domain/report-publication-scope.mjs'

// Domain unit tests: which receipt targets still belong to the confirmed reporting scope.
const preferences = (overrides = {}) => ({
  repo: 'acme/shop',
  destinations: { pr: true, issue: 'link', chat: false },
  prNumber: 7,
  issueNumber: 9,
  ...overrides,
})
const target = (type, number, repo = 'acme/shop') => ({ provider: 'github', host: 'github.com', repo, type, number })
const receipt = (targets, overrides = {}) => ({ story: 'checkout', kind: 'outcome', targets, ...overrides })

test('isDestinationSelected reads the issue mode for the issue destination, not the PR flag', () => {
  const prefs = preferences({ destinations: { pr: false, issue: 'full', chat: false } })
  assert.equal(isDestinationSelected(prefs, 'issue'), true)
  assert.equal(isDestinationSelected(prefs, 'pr'), false)
  const none = preferences({ destinations: { pr: true, issue: 'none', chat: false } })
  assert.equal(isDestinationSelected(none, 'issue'), false)
  assert.equal(isDestinationSelected(none, 'pr'), true)
})

test('configuredTarget uses the issue number for the issue destination and the PR number for the PR', () => {
  assert.deepEqual(configuredTarget(preferences(), 'issue'), target('issue', 9))
  assert.deepEqual(configuredTarget(preferences(), 'pr'), target('pr', 7))
})

test('scopedReceipt rejects a receipt of another story or another kind', () => {
  const entry = { status: 'published', target: target('pr', 7) }
  assert.equal(scopedReceipt(receipt({ pr: entry }, { kind: 'forecast' }), preferences(), 'checkout', 'outcome'), undefined)
  assert.equal(scopedReceipt(receipt({ pr: entry }, { story: 'other' }), preferences(), 'checkout', 'outcome'), undefined)
  assert.equal(scopedReceipt(undefined, preferences(), undefined, 'outcome'), undefined)
  assert.equal(scopedReceipt(undefined, preferences(), 'checkout', 'outcome'), undefined)
})

test('scopedReceipt keeps a receipt without targets as an empty scope', () => {
  assert.deepEqual(scopedReceipt({ story: 'checkout', kind: 'outcome' }, preferences(), 'checkout', 'outcome'),
    { story: 'checkout', kind: 'outcome', targets: {} })
})

test('scopedReceipt keeps both PR and issue entries that match the confirmed scope', () => {
  const pr = { status: 'published', target: target('pr', 7) }
  const issue = { status: 'published', target: target('issue', 9) }
  assert.deepEqual(scopedReceipt(receipt({ pr, issue }), preferences(), 'checkout', 'outcome'),
    { story: 'checkout', kind: 'outcome', targets: { pr, issue } })
})

test('scopedReceipt reads the issue number for issue entries and the PR number for PR entries', () => {
  const issue = { status: 'published', target: target('issue', 9) }
  const issueOnly = preferences({ destinations: { pr: true, issue: 'full', chat: false }, prNumber: null, issueNumber: 9 })
  assert.deepEqual(scopedReceipt(receipt({ issue }), issueOnly, 'checkout', 'outcome').targets, { issue })
  const pr = { status: 'published', target: target('pr', 7) }
  const prOnly = preferences({ destinations: { pr: true, issue: 'link', chat: false }, prNumber: 7, issueNumber: null })
  assert.deepEqual(scopedReceipt(receipt({ pr }), prOnly, 'checkout', 'outcome').targets, { pr })
})

test('scopedReceipt drops entries whose number is unset or whose scope differs', () => {
  const pr = { status: 'published', target: target('pr', 7) }
  const unset = preferences({ prNumber: null })
  assert.deepEqual(scopedReceipt(receipt({ pr }), unset, 'checkout', 'outcome').targets, {})
  const moved = { status: 'published', target: target('pr', 8) }
  assert.deepEqual(scopedReceipt(receipt({ pr: moved }), preferences(), 'checkout', 'outcome').targets, {})
  const otherRepo = { status: 'published', target: target('issue', 9, 'acme/other') }
  assert.deepEqual(scopedReceipt(receipt({ issue: otherRepo }), preferences(), 'checkout', 'outcome').targets, {})
})

test('scopedReceipt drops entries of a destination that is no longer selected', () => {
  const issue = { status: 'published', target: target('issue', 9) }
  const prefs = preferences({ destinations: { pr: true, issue: 'none', chat: false } })
  assert.deepEqual(scopedReceipt(receipt({ issue }), prefs, 'checkout', 'outcome').targets, {})
})
