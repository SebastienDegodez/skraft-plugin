import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { validateReportingPreferences } from '../../../plugins/skraft-framework/src/domain/reporting-preferences.mjs'
import { preparePublication } from '../../../plugins/skraft-framework/src/application/report-publication-handoff.mjs'

// Unit contract of explicit reporting preferences and the publication preparation guard.

const hashText = (text) => createHash('sha256').update(text).digest('hex')
const preferences = (overrides = {}) => ({
  confirmed: true, repo: 'owner/repo', branch: 'feature/x', prNumber: 17, issueNumber: 23,
  destinations: { pr: true, issue: 'link', chat: true }, maxMedia: 0, allowDraftPr: false, ...overrides,
})
const reasonOf = (prefs) => {
  const result = validateReportingPreferences(prefs)
  return result.ok ? 'ok' : result.error.reason
}
const BRANCH = 'Branch must be valid, and nonempty for a PR destination'

test('valid preferences are returned unchanged', () => {
  const prefs = preferences()
  const result = validateReportingPreferences(prefs)
  assert.equal(result.ok, true)
  assert.equal(result.value, prefs)
  assert.equal(result.error, undefined)
})

test('unsupported shapes are refused', () => {
  const reason = 'Reporting preferences must be an object with only supported fields'
  assert.equal(reasonOf(null), reason)
  assert.equal(reasonOf([]), reason)
  assert.equal(reasonOf(preferences({ extra: 1 })), reason)
  assert.equal(validateReportingPreferences(null).error.code, 'INVALID_REPORTING_PREFERENCES')
})

test('every explicit choice except the repository is required', () => {
  const reason = 'Reporting preferences require every explicit choice except an unused repository'
  for (const field of ['confirmed', 'branch', 'prNumber', 'issueNumber', 'destinations', 'maxMedia', 'allowDraftPr']) {
    const prefs = preferences()
    delete prefs[field]
    assert.equal(reasonOf(prefs), reason, field)
  }
  const local = preferences({ destinations: { pr: false, issue: 'none', chat: true } })
  delete local.repo
  assert.equal(reasonOf(local), 'ok')
})

test('consent and draft permission must be explicit', () => {
  const reason = 'Reporting requires confirmed consent and explicit draft PR permission'
  assert.equal(reasonOf(preferences({ confirmed: 'yes' })), reason)
  assert.equal(reasonOf(preferences({ allowDraftPr: 'no' })), reason)
})

test('destinations need every field with the right type', () => {
  const reason = 'Destinations require PR/chat booleans and an issue mode of none, link, or full'
  assert.equal(reasonOf(preferences({ destinations: { pr: true, issue: 'link' } })), reason)
  assert.equal(reasonOf(preferences({ destinations: { pr: true, issue: 'link', chat: true, slack: true } })), reason)
  assert.equal(reasonOf(preferences({ destinations: { pr: true, issue: 'some', chat: true } })), reason)
})

test('targets and media counts are bounded', () => {
  const reason = 'Targets must be positive integers or null; maxMedia must be a non-negative integer'
  assert.equal(reasonOf(preferences({ prNumber: 0 })), reason)
  assert.equal(reasonOf(preferences({ issueNumber: 1.5 })), reason)
  assert.equal(reasonOf(preferences({ maxMedia: -1 })), reason)
  assert.equal(reasonOf(preferences({ maxMedia: 2 })), 'ok')
})

test('provider scope errors are surfaced as reasons', () => {
  assert.equal(reasonOf(preferences({ repo: 'bad' })), 'Repository must match the provider scope without traversal, encoding or credentials')
})

test('git branch names follow ref rules', () => {
  for (const ok of ['feature/x', 'x-', 'a.b', 'release/1.0', 'x.lockx', 'lock.x']) {
    assert.equal(reasonOf(preferences({ branch: ok })), 'ok', ok)
  }
  for (const bad of ['-x', 'x.', 'a//b', '/a', 'a/', 'a/.x', '.x', 'x.lock', 'a/b.lock', 'a b', 'a..b', 'a@{b', 'a~b', 42, '']) {
    assert.equal(reasonOf(preferences({ branch: bad })), BRANCH, JSON.stringify(bad))
  }
  // An empty branch is fine when no PR is requested.
  assert.equal(reasonOf(preferences({ branch: '', destinations: { pr: false, issue: 'full', chat: false } })), 'ok')
})

test('issue modes need their companion choices', () => {
  assert.equal(reasonOf(preferences({ destinations: { pr: false, issue: 'link', chat: false } })), 'An issue pointer requires a PR destination')
  assert.equal(reasonOf(preferences({ issueNumber: null, destinations: { pr: false, issue: 'full', chat: false } })), 'A full issue report requires an issue number')
})

test('preparation refuses missing input with the preferences reason', () => {
  assert.throws(() => preparePublication(undefined, { hashText }),
    /^Error: Reporting preferences must be an object with only supported fields$/)
})

test('preparation refuses an issue destination that was not selected', () => {
  const input = {
    preferences: preferences({ destinations: { pr: true, issue: 'none', chat: false } }),
    story: 'S-1', kind: 'forecast', body: '# R\n', destination: 'issue', currentBranch: 'feature/x',
  }
  assert.throws(() => preparePublication(input, { hashText }), /^Error: Publication requires a selected remote destination$/)
})

test('a full issue report is prepared without a current branch', () => {
  const packet = preparePublication({
    preferences: preferences({ branch: '', destinations: { pr: false, issue: 'full', chat: false } }),
    story: 'S-1', kind: 'forecast', body: '# R\n', destination: 'issue',
  }, { hashText })
  assert.equal(packet.status, 'ready')
  assert.equal(packet.destination, 'issue')
  assert.equal(packet.target.number, 23)
  assert.equal(packet.digest, hashText(packet.body))
})

test('a PR report is prepared on the confirmed branch', () => {
  const packet = preparePublication({
    preferences: preferences({ destinations: { pr: true, issue: 'none', chat: false } }),
    story: 'S-1', kind: 'forecast', body: '# R\n', destination: 'pr', currentBranch: 'feature/x',
  }, { hashText })
  assert.equal(packet.status, 'ready')
  assert.equal(packet.target.type, 'pr')
  assert.equal(packet.target.number, 17)
})
