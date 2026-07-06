import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOk, isErr } from '../../plugins/src/domain/result.mjs'
import { validateState, validatePipelineState } from '../../plugins/src/domain/state-schema.mjs'

const VALID = { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: ['DESIGN'] }

test('D3: a well-formed state is accepted and frozen', () => {
  const result = validateState(VALID)
  assert.ok(isOk(result))
  assert.ok(Object.isFrozen(result.value), 'returned pipeline state is frozen')
  assert.ok(Object.isFrozen(result.value.skipPhases), 'skipPhases is frozen')
})

// D3 — invalid-field grid: one reject branch per field (combinatorial_economy).
const INVALID_ROWS = [
  { field: 'currentPhase', raw: { ...VALID, currentPhase: '' } },
  { field: 'specialistDone', raw: { ...VALID, specialistDone: 'yes' } },
  { field: 'reviewerVerdict', raw: { ...VALID, reviewerVerdict: 'MAYBE' } },
  { field: 'retries', raw: { ...VALID, retries: 1.5 } },
  { field: 'retries', raw: { ...VALID, retries: -1 } },
  { field: 'skipPhases', raw: { ...VALID, skipPhases: 'DESIGN' } },
  { field: 'skipPhases', raw: { ...VALID, skipPhases: [42] } }
]
for (const { field, raw } of INVALID_ROWS) {
  test(`D3: invalid ${field} (${JSON.stringify(raw[field])}) is rejected as INVALID_STATE`, () => {
    const result = validateState(raw)
    assert.ok(isErr(result))
    assert.equal(result.error.code, 'INVALID_STATE')
    assert.ok(result.error.fields.includes(field), `fields names ${field}`)
  })
}

test('D3: a non-object state is rejected', () => {
  assert.ok(isErr(validateState(null)))
  assert.ok(isErr(validateState([])))
})

// ─── validatePipelineState ────────────────────────────────────────────────────

const VALID_PIPELINE = {
  currentPhase: 'DISCOVER',
  phasesCompleted: [],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: {},
  difficulty: null,
  userPreferences: { maxRetriesPerPhase: 2 },
}

test('validatePipelineState: accepts a complete well-formed pipeline state', () => {
  const r = validatePipelineState(VALID_PIPELINE)
  assert.ok(isOk(r))
  assert.equal(r.value.currentPhase, 'DISCOVER')
})

test('validatePipelineState: rejects null input with INVALID_STATE', () => {
  const r = validatePipelineState(null)
  assert.ok(isErr(r))
  assert.equal(r.error.code, 'INVALID_STATE')
})

test('validatePipelineState: rejects array input with INVALID_STATE', () => {
  const r = validatePipelineState([])
  assert.ok(isErr(r))
  assert.equal(r.error.code, 'INVALID_STATE')
})

test('validatePipelineState: rejects when currentPhase is missing', () => {
  const r = validatePipelineState({})
  assert.ok(isErr(r))
  assert.equal(r.error.code, 'INVALID_STATE')
})

test('validatePipelineState: rejects when currentPhase is empty string', () => {
  const r = validatePipelineState({ ...VALID_PIPELINE, currentPhase: '' })
  assert.ok(isErr(r))
  assert.equal(r.error.code, 'INVALID_STATE')
})

test('validatePipelineState: rejects when currentPhase is not a string', () => {
  const r = validatePipelineState({ ...VALID_PIPELINE, currentPhase: 42 })
  assert.ok(isErr(r))
  assert.equal(r.error.code, 'INVALID_STATE')
})

test('validatePipelineState: coerces missing phasesCompleted to []', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', verdicts: {}, difficulty: null })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.phasesCompleted, [])
})

test('validatePipelineState: coerces missing retryCount to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER' })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.retryCount, {})
})

test('validatePipelineState: coerces missing verdicts to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER' })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.verdicts, {})
})

test('validatePipelineState: coerces phaseArtifacts array to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', phaseArtifacts: [] })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.phaseArtifacts, {})
})

test('validatePipelineState: coerces reviewArtifacts array to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', reviewArtifacts: [] })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.reviewArtifacts, {})
})

test('validatePipelineState: coerces null phaseArtifacts to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', phaseArtifacts: null })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.phaseArtifacts, {})
})

test('validatePipelineState: preserves existing phaseArtifacts object', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', phaseArtifacts: { DISCUSS: ['p.md'] } })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.phaseArtifacts.DISCUSS, ['p.md'])
})

test('validatePipelineState: preserves existing reviewArtifacts object', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', reviewArtifacts: { DISCOVER: ['r.md'] } })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.reviewArtifacts.DISCOVER, ['r.md'])
})

test('validatePipelineState: coerces missing difficulty to null', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER' })
  assert.ok(isOk(r))
  assert.equal(r.value.difficulty, null)
})

test('validatePipelineState: preserves string difficulty', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', difficulty: 'medium-hard' })
  assert.ok(isOk(r))
  assert.equal(r.value.difficulty, 'medium-hard')
})

test('validatePipelineState: coerces missing userPreferences to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER' })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.userPreferences, {})
})

test('validatePipelineState: preserves userPreferences object', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', userPreferences: { maxRetriesPerPhase: 3 } })
  assert.ok(isOk(r))
  assert.equal(r.value.userPreferences.maxRetriesPerPhase, 3)
})

test('validatePipelineState: coerces array userPreferences to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', userPreferences: [] })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.userPreferences, {})
})

test('validatePipelineState: coerces verdicts array to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', verdicts: ['APPROVED'] })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.verdicts, {})
})

test('validatePipelineState: coerces retryCount array to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', retryCount: [1] })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.retryCount, {})
})

// ─── round-trip fidelity (real hand-authored state.json) ───────────────────────
// Regression: validatePipelineState must NOT drop orchestrator-owned fields it does
// not normalize. Prior behaviour silently coerced to 8 keys, destroying 10 fields on
// every CLI write (proven empirically). These fields drive the DESIGN human checkpoint
// (adrRatification), HVE handoff (entryPoint), and traceability (issueNumber, ...).

const REAL_STATE = {
  projectSlug: 'us1-clean-arch-foundation',
  skraftPlanFile: '.copilot-tracking/skraft-plans/us1-clean-arch-foundation/state.json',
  currentPhase: 'DESIGN',
  entryMode: 'from-issue',
  entryPoint: { skipPhases: [], handoffSource: null, handoffArtifacts: [] },
  issueNumber: 47,
  difficulty: 'medium',
  adrRatification: { checkpointStatus: 'pending', pending: ['adr-001'], ratified: [] },
  phasesCompleted: ['DISCOVER', 'DISCUSS'],
  phaseArtifacts: { DISCOVER: ['research/triage.md'] },
  reviewerVerdicts: { DISCOVER: 'APPROVED', DISCUSS: 'APPROVED' },
  reviewArtifacts: ['reviews/discover-review.md', 'reviews/discuss-review.md'],
  retryCount: { DISCOVER: 0, DISCUSS: 0 },
  referencesProcessed: [],
  phaseHistory: { DISCOVER: { status: 'done', startedAt: 't0', completedAt: 't1' } },
  nextActions: [],
  userPreferences: { autonomyTier: 'full', depthTier: 'comprehensive', maxRetriesPerPhase: 2 },
  depthTierOverrides: [],
  neighborPlanners: { securityPlanFile: null, raiPlanFile: null, ssscPlanFile: null },
}

test('round-trip: preserves every orchestrator-owned field (no silent drop)', () => {
  const r = validatePipelineState(REAL_STATE)
  assert.ok(isOk(r))
  const v = r.value
  assert.deepEqual(v.entryPoint, REAL_STATE.entryPoint, 'entryPoint preserved')
  assert.deepEqual(v.adrRatification, REAL_STATE.adrRatification, 'adrRatification preserved')
  assert.equal(v.issueNumber, 47, 'issueNumber preserved')
  assert.equal(v.projectSlug, REAL_STATE.projectSlug, 'projectSlug preserved')
  assert.equal(v.skraftPlanFile, REAL_STATE.skraftPlanFile, 'skraftPlanFile preserved')
  assert.equal(v.entryMode, 'from-issue', 'entryMode preserved')
  assert.deepEqual(v.phaseHistory, REAL_STATE.phaseHistory, 'phaseHistory preserved')
  assert.deepEqual(v.nextActions, [], 'nextActions preserved')
  assert.deepEqual(v.referencesProcessed, [], 'referencesProcessed preserved')
  assert.deepEqual(v.depthTierOverrides, [], 'depthTierOverrides preserved')
  assert.deepEqual(v.neighborPlanners, REAL_STATE.neighborPlanners, 'neighborPlanners preserved')
})

test('round-trip: migrates reviewerVerdicts -> verdicts and drops the alias', () => {
  const r = validatePipelineState(REAL_STATE)
  assert.ok(isOk(r))
  assert.deepEqual(r.value.verdicts, { DISCOVER: 'APPROVED', DISCUSS: 'APPROVED' })
  assert.equal(r.value.reviewerVerdicts, undefined, 'legacy alias removed (no split-brain)')
})

test('round-trip: canonical verdicts wins over legacy reviewerVerdicts when both present', () => {
  const r = validatePipelineState({
    currentPhase: 'DISCOVER',
    verdicts: { DISCOVER: 'CHANGES_REQUESTED' },
    reviewerVerdicts: { DISCOVER: 'APPROVED' },
  })
  assert.ok(isOk(r))
  assert.equal(r.value.verdicts.DISCOVER, 'CHANGES_REQUESTED')
  assert.equal(r.value.reviewerVerdicts, undefined)
})

test('round-trip: flat-array reviewArtifacts preserved under reviewArtifactsLegacy; map restarts empty', () => {
  const r = validatePipelineState(REAL_STATE)
  assert.ok(isOk(r))
  assert.deepEqual(r.value.reviewArtifacts, {}, 'canonical map restarts empty')
  assert.deepEqual(r.value.reviewArtifactsLegacy, REAL_STATE.reviewArtifacts, 'legacy paths preserved verbatim')
})

test('round-trip: no reviewArtifactsLegacy key when reviewArtifacts is already a map', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', reviewArtifacts: { DISCOVER: ['r.md'] } })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.reviewArtifacts, { DISCOVER: ['r.md'] })
  assert.equal(r.value.reviewArtifactsLegacy, undefined)
})

test('round-trip: empty flat arrays do not create Legacy keys', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', reviewArtifacts: [], phaseArtifacts: [] })
  assert.ok(isOk(r))
  assert.equal(r.value.reviewArtifactsLegacy, undefined)
  assert.equal(r.value.phaseArtifactsLegacy, undefined)
})

test('round-trip: flat-array phaseArtifacts preserved under phaseArtifactsLegacy; map restarts empty', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', phaseArtifacts: ['plans/a.md', 'plans/b.md'] })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.phaseArtifacts, {}, 'canonical map restarts empty')
  assert.deepEqual(r.value.phaseArtifactsLegacy, ['plans/a.md', 'plans/b.md'], 'legacy paths preserved verbatim')
})
