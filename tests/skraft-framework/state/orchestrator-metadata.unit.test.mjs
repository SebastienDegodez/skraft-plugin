import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTransition } from '../../../plugins/skraft-framework/src/domain/state-machine.mjs'
import { validateMetadataField } from '../../../plugins/skraft-framework/src/domain/orchestrator-metadata-policy.mjs'

const mkState = (overrides = {}) => ({
  currentPhase: 'RESEARCH',
  phasesCompleted: [],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: {},
  userPreferences: { maxRetriesPerPhase: 2 },
  ...overrides,
})

const set = (field, value, state = mkState()) => applyTransition(state, { type: 'SET_METADATA', field, value })

// ─── SET_METADATA: orchestrator-owned fields ───────────────────────────────────

test('SET_METADATA: records the ADR ratification checkpoint', () => {
  const adrRatification = {
    checkpointStatus: 'awaiting_human',
    pending: [{ adr: '012', title: 'Outbox', recommended: 'accept', status: 'Proposed' }],
    ratified: [],
  }
  const r = set('adrRatification', adrRatification)
  assert.equal(r.ok, true)
  assert.deepEqual(r.value.adrRatification, adrRatification)
})

test('SET_METADATA: rejects an unknown ratification status', () => {
  const r = set('adrRatification', { checkpointStatus: 'pending', pending: [], ratified: [] })
  assert.equal(r.error.code, 'INVALID_METADATA')
})

test('SET_METADATA: replaces next actions and processed references with string lists', () => {
  assert.deepEqual(set('nextActions', ['ask the user']).value.nextActions, ['ask the user'])
  assert.deepEqual(set('referencesProcessed', ['docs/prd.md']).value.referencesProcessed, ['docs/prd.md'])
  assert.equal(set('nextActions', 'ask the user').error.code, 'INVALID_METADATA')
})

test('SET_METADATA: records neighbor planners, entry mode, issue number and plan file', () => {
  const neighborPlanners = { securityPlanFile: '.copilot-tracking/security-plans/x/plan.md', raiPlanFile: null, ssscPlanFile: null }
  assert.deepEqual(set('neighborPlanners', neighborPlanners).value.neighborPlanners, neighborPlanners)
  assert.equal(set('entryMode', 'from-issue').value.entryMode, 'from-issue')
  assert.equal(set('issueNumber', 42).value.issueNumber, 42)
  assert.equal(set('skraftPlanFile', 'plans/x.md').value.skraftPlanFile, 'plans/x.md')
  assert.equal(set('entryMode', 'guess').error.code, 'INVALID_METADATA')
  assert.equal(set('issueNumber', -1).error.code, 'INVALID_METADATA')
})

test('SET_METADATA: refuses invariant-bearing fields', () => {
  for (const field of ['currentPhase', 'verdicts', 'phaseArtifacts', 'retryCount', 'projectSlug', 'phaseHistory', 'entryPoint']) {
    const r = set(field, {})
    assert.equal(r.ok, false, field)
    assert.equal(r.error.code, 'IMMUTABLE_FIELD', field)
  }
})

test('SET_METADATA: preserves every other field', () => {
  const r = set('nextActions', ['x'], mkState({ verdicts: { RESEARCH: 'APPROVED' }, issueNumber: 7 }))
  assert.equal(r.value.verdicts.RESEARCH, 'APPROVED')
  assert.equal(r.value.issueNumber, 7)
})

// ─── Phase history ─────────────────────────────────────────────────────────────

test('MARK_PHASE_STARTED: records the start time and base commit of the current phase', () => {
  const r = applyTransition(mkState({ currentPhase: 'DELIVER' }), {
    type: 'MARK_PHASE_STARTED', phase: 'DELIVER', at: '2026-09-23T10:00:00.000Z', baseSha: 'abc123',
  })
  assert.equal(r.ok, true)
  assert.deepEqual(r.value.phaseHistory.DELIVER, { status: 'inProgress', startedAt: '2026-09-23T10:00:00.000Z', baseSha: 'abc123' })
})

test('MARK_PHASE_STARTED: keeps the first start of a phase across retries', () => {
  const state = mkState({
    currentPhase: 'DELIVER',
    phaseHistory: { DELIVER: { status: 'inProgress', startedAt: '2026-09-23T10:00:00.000Z', baseSha: 'abc123' } },
  })
  const r = applyTransition(state, { type: 'MARK_PHASE_STARTED', phase: 'DELIVER', at: '2026-09-23T11:00:00.000Z', baseSha: 'def456' })
  assert.deepEqual(r.value.phaseHistory.DELIVER, { status: 'inProgress', startedAt: '2026-09-23T10:00:00.000Z', baseSha: 'abc123' })
})

test('MARK_PHASE_STARTED: only the phase currently open can start', () => {
  const r = applyTransition(mkState(), { type: 'MARK_PHASE_STARTED', phase: 'DELIVER', at: 't', baseSha: null })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'PHASE_MISMATCH')
})

test('ADVANCE and CLOSE_PHASE mark the closed phase done when given a time', () => {
  const started = { RESEARCH: { status: 'inProgress', startedAt: 't0', baseSha: null } }
  const advanced = applyTransition(
    mkState({ verdicts: { RESEARCH: 'APPROVED' }, phaseHistory: started }),
    { type: 'ADVANCE', targetPhase: 'DESIGN', at: 't1' },
  )
  assert.deepEqual(advanced.value.phaseHistory.RESEARCH, { status: 'done', startedAt: 't0', baseSha: null, completedAt: 't1' })

  const closed = applyTransition(
    mkState({ phaseHistory: started }),
    { type: 'CLOSE_PHASE', phase: 'RESEARCH', verdict: 'APPROVED', at: 't2' },
  )
  assert.deepEqual(closed.value.phaseHistory.RESEARCH, { status: 'done', startedAt: 't0', baseSha: null, completedAt: 't2' })
})

// ─── validateMetadataField: shapes and reasons ─────────────────────────────────


test('validateMetadataField: accepts every documented enum value', () => {
  for (const checkpointStatus of ['none', 'awaiting_human', 'resolved', null]) {
    assert.equal(validateMetadataField('adrRatification', { checkpointStatus, pending: [], ratified: [] }).ok, true, checkpointStatus)
  }
  for (const entryMode of ['capture', 'from-issue', 'from-prd', null]) {
    assert.equal(validateMetadataField('entryMode', entryMode).ok, true, entryMode)
  }
  assert.equal(validateMetadataField('issueNumber', null).ok, true)
  assert.equal(validateMetadataField('skraftPlanFile', null).ok, true)
  assert.equal(validateMetadataField('neighborPlanners', {}).ok, true)
})

test('validateMetadataField: rejects values that are not the documented shape, naming the problem', () => {
  const cases = [
    ['adrRatification', null, 'adrRatification must be an object'],
    ['adrRatification', { checkpointStatus: 'none', pending: {}, ratified: [] }, 'adrRatification.pending must be an array'],
    ['adrRatification', { checkpointStatus: 'none', pending: ['012'], ratified: [] }, 'adrRatification.pending[0] must be an object'],
    ['adrRatification', { checkpointStatus: 'none', pending: [null], ratified: [] }, 'adrRatification.pending[0] must be an object'],
    ['adrRatification', { checkpointStatus: 'none', pending: [], ratified: [[]] }, 'adrRatification.ratified[0] must be an object'],
    [
      'adrRatification',
      { checkpointStatus: 'awaiting_human', pending: [{ adr: '012' }], ratified: [] },
      'adrRatification.pending[0].title is required; adrRatification.pending[0].recommended is required; adrRatification.pending[0].status is required',
    ],
    ['nextActions', [''], 'nextActions[0] must have at least 1 character(s)'],
    ['referencesProcessed', 'docs/prd.md', 'referencesProcessed must be an array'],
    ['neighborPlanners', null, 'neighborPlanners must be an object'],
    ['neighborPlanners', { raiPlanFile: 7 }, 'neighborPlanners.raiPlanFile must be a string or null'],
    ['neighborPlanners', { ssscPlanFile: '' }, 'neighborPlanners.ssscPlanFile must have at least 1 character(s)'],
    ['entryMode', 'guess', 'entryMode must be one of capture, from-issue, from-prd, null'],
    ['issueNumber', 0, 'issueNumber must be at least 1'],
    ['issueNumber', 1.5, 'issueNumber must be an integer or null'],
    ['skraftPlanFile', '', 'skraftPlanFile must have at least 1 character(s)'],
    ['skraftPlanFile', 3, 'skraftPlanFile must be a string or null'],
  ]
  for (const [field, value, reason] of cases) {
    const r = validateMetadataField(field, value)
    assert.equal(r.ok, false, `${field} ${JSON.stringify(value)}`)
    assert.equal(r.error.code, 'INVALID_METADATA')
    assert.equal(r.error.field, field)
    assert.equal(r.error.reason, reason)
  }
})

test('validateMetadataField: lists the settable fields when a field is refused', () => {
  const r = validateMetadataField('verdicts', {})
  assert.equal(r.error.field, 'verdicts')
  assert.equal(
    r.error.reason,
    'verdicts is not settable; settable fields: adrRatification, nextActions, referencesProcessed, neighborPlanners, entryMode, issueNumber, skraftPlanFile',
  )
})
