import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOk, isErr } from '../../../plugins/skraft-framework/src/domain/result.mjs'
import { projectDispatchState, validatePipelineState } from '../../../plugins/skraft-framework/src/domain/state-schema.mjs'

// ─── projectDispatchState ─────────────────────────────────────────────────────

test('projectDispatchState: projects the current phase of the state the CLI writes', () => {
  const r = projectDispatchState({
    currentPhase: 'DESIGN',
    phaseArtifacts: { RESEARCH: ['research/r.md'], DESIGN: ['details/d/contracts-x.md'] },
    verdicts: { RESEARCH: 'APPROVED', DESIGN: 'CHANGES_REQUESTED' },
    retryCount: { DESIGN: 1 },
    userPreferences: { maxRetriesPerPhase: 3 },
  })
  assert.ok(isOk(r))
  assert.deepEqual({ ...r.value }, { currentPhase: 'DESIGN', specialistDone: true, reviewerVerdict: 'CHANGES_REQUESTED', retries: 1, maxRetries: 3 })
  assert.ok(Object.isFrozen(r.value))
})

test('projectDispatchState: a fresh phase has no artefact, no verdict and the default budget', () => {
  const r = projectDispatchState({ currentPhase: 'RESEARCH', phaseArtifacts: { DESIGN: ['x'] } })
  assert.deepEqual({ ...r.value }, { currentPhase: 'RESEARCH', specialistDone: false, reviewerVerdict: null, retries: 0, maxRetries: 2 })
})

test('projectDispatchState: an empty artefact list is not a done specialist', () => {
  assert.equal(projectDispatchState({ currentPhase: 'DESIGN', phaseArtifacts: { DESIGN: [] } }).value.specialistDone, false)
})

test('projectDispatchState: rejects what validatePipelineState rejects', () => {
  for (const raw of [null, [], {}, { currentPhase: '' }]) {
    const r = projectDispatchState(raw)
    assert.ok(isErr(r), JSON.stringify(raw))
    assert.equal(r.error.code, 'INVALID_STATE')
  }
})

// ─── validatePipelineState ────────────────────────────────────────────────────

const VALID_PIPELINE = {
  currentPhase: 'DISCOVER',
  phasesCompleted: [],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: {},
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
  const r = validatePipelineState({ currentPhase: 'DISCOVER', verdicts: {} })
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

test('validatePipelineState: coerces missing reworkCount to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER' })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.reworkCount, {})
})

test('validatePipelineState: coerces reworkCount array to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', reworkCount: [1] })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.reworkCount, {})
})

test('validatePipelineState: preserves existing reworkCount object', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', reworkCount: { DELIVER: 2 } })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.reworkCount, { DELIVER: 2 })
})

test('validatePipelineState: coerces missing findingsResolved to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER' })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.findingsResolved, {})
})

test('validatePipelineState: coerces findingsResolved array to {}', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', findingsResolved: [1] })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.findingsResolved, {})
})

test('validatePipelineState: preserves existing findingsResolved object', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', findingsResolved: { DELIVER: 12 } })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.findingsResolved, { DELIVER: 12 })
})

// ─── round-trip fidelity (real hand-authored state.json) ───────────────────────
// Regression: validatePipelineState must NOT drop orchestrator-owned fields it does
// not normalize. Prior behaviour silently coerced to 8 keys, destroying 10 fields on
// every CLI write (proven empirically). These fields drive the DESIGN human checkpoint
// (adrRatification), upstream handoff (entryPoint), and traceability (issueNumber, ...).

const REAL_STATE = {
  projectSlug: 'us1-clean-arch-foundation',
  skraftPlanFile: '.copilot-tracking/skraft-plans/us1-clean-arch-foundation/state.json',
  currentPhase: 'DESIGN',
  entryMode: 'from-issue',
  entryPoint: { skipPhases: [], handoffSource: null, handoffArtifacts: [] },
  issueNumber: 47,
  adrRatification: { checkpointStatus: 'pending', pending: ['adr-001'], ratified: [] },
  phasesCompleted: ['DISCOVER', 'DISCUSS'],
  phaseArtifacts: { DISCOVER: ['research/triage.md'] },
  reviewerVerdicts: { DISCOVER: 'APPROVED', DISCUSS: 'APPROVED' },
  reviewArtifacts: ['reviews/discover-review.md', 'reviews/discuss-review.md'],
  retryCount: { DISCOVER: 0, DISCUSS: 0 },
  referencesProcessed: [],
  phaseHistory: { DISCOVER: { status: 'done', startedAt: 't0', completedAt: 't1' } },
  nextActions: [],
  userPreferences: { autonomyTier: 'full', reviewCadence: 'weekly', maxRetriesPerPhase: 2 },
  legacyOverrides: [],
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
  assert.deepEqual(v.legacyOverrides, [], 'unknown top-level fields preserved')
  assert.deepEqual(v.neighborPlanners, REAL_STATE.neighborPlanners, 'neighborPlanners preserved')
})

test('round-trip: removes obsolete difficulty field', () => {
  const r = validatePipelineState({ currentPhase: 'RESEARCH', difficulty: 'simple' })
  assert.ok(isOk(r))
  assert.equal(Object.hasOwn(r.value, 'difficulty'), false)
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
