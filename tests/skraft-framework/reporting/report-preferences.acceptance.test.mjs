import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStateService } from '../../../plugins/skraft-framework/src/application/state-service.mjs'
import { Ok, Err } from '../../../plugins/skraft-framework/src/domain/result.mjs'

const SLUG = 'report-preferences'
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

const pipeline = () => ({
  projectSlug: SLUG,
  currentPhase: 'DISTILL',
  issueNumber: 23,
  adrRatification: { checkpointStatus: 'resolved', pending: [], ratified: [{ adr: '001', verdict: 'Accepted', by: 'owner 2026-09-17' }] },
  phasesCompleted: ['DISCOVER', 'DISCUSS', 'DESIGN'],
  phaseArtifacts: { DISTILL: ['plans/tests.md'] },
  verdicts: { DESIGN: 'APPROVED', DISTILL: 'CHANGES_REQUESTED' },
  reviewArtifacts: { DISTILL: ['reviews/tests.md'] },
  retryCount: { DISTILL: 1 },
  reworkCount: { DESIGN: 2 },
  findingsResolved: { DISTILL: 3 },
  phaseHistory: { DESIGN: { status: 'done', completedAt: '2026-09-17T10:00:00Z' } },
  nextActions: ['review test plan'],
  userPreferences: { maxRetriesPerPhase: 7 },
  neighborPlanners: { securityPlanFile: 'plans/security.md', raiPlanFile: null, ssscPlanFile: null },
})

// Stateful IO double only: no preference validation or command behavior in the fixture.
const memoryState = (initial = pipeline(), { readError, writeError } = {}) => {
  const states = new Map(initial === undefined ? [] : [[SLUG, initial]])
  const writes = []
  const ports = {
    stateReader: {
      read: async (slug) => {
        if (readError) throw readError
        if (!states.has(slug)) throw Object.assign(new Error('No recorded state'), { code: 'ENOENT' })
        return states.get(slug)
      },
    },
    stateWriter: {
      write: async (slug, state) => {
        writes.push({ slug, state: structuredClone(state) })
        if (writeError) return Err(writeError)
        states.set(slug, structuredClone(state))
        return Ok(undefined)
      },
    },
  }
  return { states, writes, ports, service: createStateService(ports) }
}

const without = (object, key) => {
  const copy = { ...object }
  delete copy[key]
  return copy
}

const assertSaved = async (prefs, initial = pipeline()) => {
  const before = structuredClone(initial)
  const inputBefore = structuredClone(prefs)
  const store = memoryState(initial)
  const result = await store.service.configureReporting(SLUG, prefs)
  const expected = {
    ...before,
    userPreferences: { ...before.userPreferences, reporting: inputBefore },
  }
  assert.equal(result.ok, true, `Expected saved reporting preferences, received ${JSON.stringify(result)}`)
  assert.deepEqual(result, Ok(expected))
  assert.deepEqual(store.writes, [{ slug: SLUG, state: expected }])
  assert.deepEqual(store.states.get(SLUG), expected)
  assert.deepEqual(initial, before, 'must not mutate reader-owned state')
  assert.deepEqual(prefs, inputBefore, 'must not mutate caller-owned preferences')
  const resumed = createStateService(store.ports)
  assert.deepEqual(await resumed.get(SLUG), Ok(expected), 'resume must read persisted choices')
}

test('an existing pipeline without reporting setup has no implicit publication consent', async () => {
  const store = memoryState()
  const result = await store.service.get(SLUG)
  assert.equal(result.ok, true)
  assert.equal(Object.hasOwn(result.value.userPreferences, 'reporting'), false)
  assert.deepEqual(store.writes, [])
})

test('confirmed setup persists exact choices and preserves every pipeline and retry preference field', async () => {
  await assertSaved(preferences())
})

test('publication choices can change at DONE without restarting engineering or changing its records', async () => {
  const initial = pipeline()
  initial.currentPhase = 'DONE'
  initial.phasesCompleted = ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL', 'DELIVER']
  initial.verdicts = Object.fromEntries(initial.phasesCompleted.map(phase => [phase, 'APPROVED']))
  initial.nextActions = []
  initial.userPreferences.reporting = preferences()
  await assertSaved(preferences({ maxMedia: 3, allowDraftPr: true, prNumber: 31 }), initial)
})

test('reconfirming identical choices across resume preserves state without accumulating reporting data', async () => {
  const initial = pipeline()
  const before = structuredClone(initial)
  const prefs = preferences({ maxMedia: 8 })
  const expected = { ...before, userPreferences: { ...before.userPreferences, reporting: prefs } }
  const store = memoryState(initial)
  const first = await store.service.configureReporting(SLUG, prefs)
  assert.equal(first.ok, true, `Expected saved preferences, received ${JSON.stringify(first)}`)
  assert.deepEqual(first, Ok(expected))
  const resumed = createStateService(store.ports)
  assert.deepEqual(await resumed.configureReporting(SLUG, prefs), Ok(expected))
  assert.deepEqual(await resumed.get(SLUG), Ok(expected))
  assert.deepEqual(initial, before)
})

test('setup preserves a sparse legacy state without introducing unrelated phase defaults', async () => {
  await assertSaved(preferences(), { currentPhase: 'DISCOVER', userPreferences: { maxRetriesPerPhase: 4 } })
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
  test(`setup accepts ${name} without inventing limits or permissions`, async () => {
    await assertSaved(preferences(overrides))
  })
}

for (const repo of [null, undefined]) {
  test(`chat-only setup needs no repository (${repo === null ? 'null' : 'omitted'})`, async () => {
    const prefs = preferences({
      repo: null, branch: '', prNumber: null, issueNumber: null,
      destinations: { pr: false, issue: 'none', chat: true },
    })
    await assertSaved(repo === undefined ? without(prefs, 'repo') : prefs)
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
  test(`setup refuses ${name} without replacing existing consent or writing state`, async () => {
    const initial = pipeline()
    initial.userPreferences.reporting = preferences({ maxMedia: 2 })
    const before = structuredClone(initial)
    const store = memoryState(initial)
    const result = await store.service.configureReporting(SLUG, prefs)
    assert.deepEqual(store.writes, [], 'invalid preferences must not reach persistence')
    assert.deepEqual(store.states.get(SLUG), before, 'prior consent and all state must remain intact')
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'INVALID_REPORTING_PREFERENCES')
    assert.equal(Object.hasOwn(result, 'value'), false)
  })
}

test('configuring an unknown project returns ENOENT without implicit initialization or touching another project', async () => {
  const store = memoryState()
  const before = structuredClone(store.states)
  const result = await store.service.configureReporting('missing-project', preferences())
  assert.deepEqual(store.writes, [])
  assert.deepEqual(store.states, before)
  assert.deepEqual(result, Err({ code: 'ENOENT' }))
})

for (const [readCode, expectedCode] of [['CORRUPTED_STATE', 'CORRUPTED_STATE'], ['EIO', 'IO_ERROR']]) {
  test(`setup reports ${expectedCode} when state cannot be read, without writing`, async () => {
    const readError = Object.assign(new Error('State unavailable'), { code: readCode })
    const store = memoryState(pipeline(), { readError })
    const result = await store.service.configureReporting(SLUG, preferences())
    assert.deepEqual(store.writes, [])
    assert.equal(result.ok, false)
    assert.equal(result.error.code, expectedCode)
  })
}

for (const initial of [null, [], {}, { currentPhase: null }]) {
  test(`setup refuses invalid recorded state ${JSON.stringify(initial)} without repairing or replacing it`, async () => {
    const before = structuredClone(initial)
    const store = memoryState(initial)
    const result = await store.service.configureReporting(SLUG, preferences())
    assert.deepEqual(store.writes, [])
    assert.deepEqual(store.states.get(SLUG), before)
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'INVALID_STATE')
  })
}

test('failed persistence returns writer error and leaves previous preferences and state intact', async () => {
  const initial = pipeline()
  initial.userPreferences.reporting = preferences()
  const before = structuredClone(initial)
  const writeError = { code: 'IO_ERROR', reason: 'disk full' }
  const store = memoryState(initial, { writeError })
  const result = await store.service.configureReporting(SLUG, preferences({ maxMedia: 4 }))
  assert.deepEqual(store.states.get(SLUG), before)
  assert.deepEqual(initial, before)
  assert.deepEqual(result, Err(writeError))
  assert.equal(store.writes.length, 1)
})