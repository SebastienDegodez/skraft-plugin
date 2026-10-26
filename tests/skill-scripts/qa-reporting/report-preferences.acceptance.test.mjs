import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateReportingPreferences } from '../../../plugins/skraft-framework/skills/qa-reporting/scripts/report/domain/reporting-preferences.mjs'

// Setup stores what this validation accepts, byte for byte, in reporting/preferences.json
// (report-cli.acceptance.test.mjs covers the file); nothing here infers consent or defaults.
const preferences = (overrides = {}) => ({
  confirmed: true,
  repo: 'owner/repo',
  branch: 'feature/x',
  prNumber: 17,
  issueNumber: 23,
  destinations: { pr: true, issue: 'link', chat: true },
  maxMedia: 0,
  allowDraftPr: false,
  ...overrides,
})

const without = (object, key) => {
  const copy = { ...object }
  delete copy[key]
  return copy
}

const assertSaved = (prefs) => {
  const inputBefore = structuredClone(prefs)
  const result = validateReportingPreferences(prefs)
  assert.equal(result.ok, true, `Expected accepted reporting preferences, received ${JSON.stringify(result)}`)
  assert.deepEqual(result.value, inputBefore, 'accepted choices are kept exactly as given')
  assert.deepEqual(prefs, inputBefore, 'must not mutate caller-owned preferences')
}

test('confirmed setup keeps the exact choices', () => {
  assertSaved(preferences())
})

const acceptedChoices = [
  ['pending PR with issue pointer and no draft permission', { prNumber: null }],
  ['pending PR with explicit draft permission', { prNumber: null, allowDraftPr: true }],
  ['pending issue pointer with no issue number yet', { prNumber: null, issueNumber: null }],
  ['full issue report without PR destination or branch', {
    branch: '', prNumber: null, destinations: { pr: false, issue: 'full', chat: false },
  }],
  ['PR-only report without issue number', {
    issueNumber: null, destinations: { pr: true, issue: 'none', chat: false },
  }],
  ['explicitly disabled destinations', {
    repo: null, branch: '', prNumber: null, issueNumber: null,
    destinations: { pr: false, issue: 'none', chat: false },
  }],
  ['one selected media item', { maxMedia: 1 }],
  ['media bound above withdrawn five-file proposal', { maxMedia: 6 }],
  ['smallest positive target numbers', { prNumber: 1, issueNumber: 1 }],
]
for (const [name, overrides] of acceptedChoices) {
  test(`setup accepts ${name} without inventing limits or permissions`, () => {
    assertSaved(preferences(overrides))
  })
}

for (const repo of [null, undefined]) {
  test(`chat-only setup needs no repository (${repo === null ? 'null' : 'omitted'})`, () => {
    const prefs = preferences({
      repo: null, branch: '', prNumber: null, issueNumber: null,
      destinations: { pr: false, issue: 'none', chat: true },
    })
    assertSaved(repo === undefined ? without(prefs, 'repo') : prefs)
  })
}

const invalidChoices = [
  ['missing setup', undefined],
  ['null setup', null],
  ['array setup', []],
  ['string setup', 'confirmed'],
  ['boolean setup', true],
  ['number setup', 1],
  ['empty setup', {}],
  ['unconfirmed setup', preferences({ confirmed: false })],
  ['unknown preference', preferences({ publish: true })],
  ['withdrawn byte quota', preferences({ maxBytes: 20 * 1024 * 1024 })],
  ['unknown destination', preferences({ destinations: { pr: true, issue: 'link', chat: true, release: true } })],
  ['issue pointer without PR destination even with a PR number', preferences({
    destinations: { pr: false, issue: 'link', chat: true },
  })],
  ['issue pointer without PR destination or number', preferences({
    prNumber: null, destinations: { pr: false, issue: 'link', chat: true },
  })],
  ['full issue without issue number', preferences({
    issueNumber: null, destinations: { pr: false, issue: 'full', chat: true },
  })],
]

for (const field of Object.keys(preferences())) {
  invalidChoices.push([`missing ${field}`, without(preferences(), field)])
}
for (const field of ['confirmed', 'allowDraftPr']) {
  for (const value of [null, 'true', 'false', 0, 1, [], {}]) {
    invalidChoices.push([`${field} must be an explicit boolean: ${JSON.stringify(value)}`, preferences({ [field]: value })])
  }
}
for (const field of ['pr', 'chat']) {
  for (const value of [null, 'true', 'false', 0, 1, [], {}]) {
    invalidChoices.push([`${field} destination must be an explicit boolean: ${JSON.stringify(value)}`, preferences({
      destinations: { ...preferences().destinations, [field]: value },
    })])
  }
}
for (const value of [null, [], 'pr', true, 1, {}]) {
  invalidChoices.push([`malformed destinations: ${JSON.stringify(value)}`, preferences({ destinations: value })])
}
for (const field of ['pr', 'issue', 'chat']) {
  invalidChoices.push([`missing ${field} destination`, preferences({ destinations: without(preferences().destinations, field) })])
}
for (const value of [null, true, false, 1, '', 'summary', 'LINK', [], {}]) {
  invalidChoices.push([`unknown issue mode: ${JSON.stringify(value)}`, preferences({
    destinations: { ...preferences().destinations, issue: value },
  })])
}
for (const field of ['prNumber', 'issueNumber']) {
  for (const value of [0, -1, 1.5, '17', true, false, [], {}, NaN, Infinity]) {
    invalidChoices.push([`${field} must be a positive integer or null: ${String(value)}`, preferences({ [field]: value })])
  }
}
for (const value of [-1, 1.5, '0', null, true, false, [], {}, NaN, Infinity]) {
  invalidChoices.push([`maxMedia must be an explicit non-negative integer: ${String(value)}`, preferences({ maxMedia: value })])
}
for (const value of [null, '', ' ', 'owner', '/repo', 'owner/', 'owner/repo/extra', 'owner /repo', true, [], {}]) {
  invalidChoices.push([`GitHub repository must identify owner/repo: ${JSON.stringify(value)}`, preferences({ repo: value })])
}
for (const value of [null, '', ' \t ', true, 17, [], {}]) {
  invalidChoices.push([`PR destination requires a nonempty branch: ${JSON.stringify(value)}`, preferences({ branch: value })])
}
for (const repo of [null, undefined]) {
  const prefs = preferences({
    repo, branch: '', prNumber: null, destinations: { pr: false, issue: 'full', chat: true },
  })
  invalidChoices.push([`full issue destination also requires repository: ${String(repo)}`,
    repo === undefined ? without(prefs, 'repo') : prefs])
}
invalidChoices.push(['malformed repository is not excused by chat-only selection', preferences({
  repo: 42, destinations: { pr: false, issue: 'none', chat: true },
})])

for (const [name, prefs] of invalidChoices) {
  test(`setup refuses ${name}`, () => {
    const result = validateReportingPreferences(prefs)
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'INVALID_REPORTING_PREFERENCES')
    assert.equal(Object.hasOwn(result, 'value'), false)
  })
}
