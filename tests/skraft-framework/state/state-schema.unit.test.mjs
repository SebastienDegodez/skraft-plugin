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

test('validatePipelineState: reads every absent invariant field as empty', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER' })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.phasesCompleted, [])
  for (const field of ['phaseArtifacts', 'verdicts', 'reviewArtifacts', 'retryCount', 'reworkCount', 'findingsResolved', 'userPreferences']) {
    assert.deepEqual(r.value[field], {}, field)
  }
})

test('validatePipelineState: rejects a value of the wrong shape instead of coercing it', () => {
  const wrongShapes = {
    phasesCompleted: 'DISCOVER',
    phaseArtifacts: [],
    reviewArtifacts: ['reviews/r.md'],
    verdicts: ['APPROVED'],
    retryCount: [1],
    reworkCount: [1],
    findingsResolved: [1],
    userPreferences: [],
  }
  for (const [field, value] of Object.entries(wrongShapes)) {
    const r = validatePipelineState({ currentPhase: 'DISCOVER', [field]: value })
    assert.ok(isErr(r), field)
    assert.equal(r.error.code, 'INVALID_STATE')
    assert.deepEqual(r.error.fields, [field])
  }
})

test('validatePipelineState: rejects a null invariant field', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', phaseArtifacts: null })
  assert.ok(isErr(r))
  assert.deepEqual(r.error.fields, ['phaseArtifacts'])
})

test('validatePipelineState: rejects a verdict, a count or a path outside its values', () => {
  const invalid = [
    [{ verdicts: { DESIGN: 'NEEDS_REWORK' } }, 'verdicts.DESIGN must be one of APPROVED, CHANGES_REQUESTED, null'],
    [{ retryCount: { DESIGN: -1 } }, 'retryCount.DESIGN must be at least 0'],
    [{ reworkCount: { DESIGN: 1.5 } }, 'reworkCount.DESIGN must be an integer'],
    [{ phaseArtifacts: { DESIGN: [''] } }, 'phaseArtifacts.DESIGN[0] must have at least 1 character(s)'],
    [{ phaseHistory: { DESIGN: { status: 'started' } } }, 'phaseHistory.DESIGN.status must be one of inProgress, done'],
  ]
  for (const [fields, reason] of invalid) {
    const r = validatePipelineState({ currentPhase: 'DESIGN', ...fields })
    assert.ok(isErr(r), reason)
    assert.equal(r.error.reason, reason)
  }
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

test('validatePipelineState: preserves userPreferences object', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', userPreferences: { maxRetriesPerPhase: 3 } })
  assert.ok(isOk(r))
  assert.equal(r.value.userPreferences.maxRetriesPerPhase, 3)
})

test('validatePipelineState: preserves existing reworkCount object', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', reworkCount: { DELIVER: 2 } })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.reworkCount, { DELIVER: 2 })
})

test('validatePipelineState: preserves existing findingsResolved object', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', findingsResolved: { DELIVER: 12 } })
  assert.ok(isOk(r))
  assert.deepEqual(r.value.findingsResolved, { DELIVER: 12 })
})

test('validatePipelineState: copies the recorded lists, never shares them', () => {
  const raw = { currentPhase: 'DISCOVER', phasesCompleted: ['RESEARCH'], phaseArtifacts: { DESIGN: ['d.md'] } }
  const r = validatePipelineState(raw)
  assert.notEqual(r.value.phasesCompleted, raw.phasesCompleted)
  assert.notEqual(r.value.phaseArtifacts.DESIGN, raw.phaseArtifacts.DESIGN)
  assert.ok(Object.isFrozen(r.value))
})

// ─── round-trip fidelity ──────────────────────────────────────────────────────
// Every field the schema declares survives validation, so no CLI write drops one.

const RECORDED_STATE = {
  projectSlug: 'us1-clean-arch-foundation',
  currentPhase: 'DESIGN',
  adrRatification: {
    checkpointStatus: 'awaiting_human',
    pending: [{ adr: '001', title: 'Layered modules', recommended: 'accept', status: 'Proposed' }],
    ratified: [{ adr: '000', verdict: 'Accepted', by: 'owner 2026-09-20' }],
  },
  phasesCompleted: ['RESEARCH'],
  phaseArtifacts: { RESEARCH: ['research/2026-09-20/us1-research.md'] },
  verdicts: { RESEARCH: 'APPROVED' },
  reviewArtifacts: {},
  retryCount: { RESEARCH: 0 },
  reworkCount: {},
  findingsResolved: {},
  phaseHistory: {
    RESEARCH: { status: 'done', startedAt: 't0', baseSha: null, completedAt: 't1' },
    DESIGN: { status: 'inProgress', startedAt: 't1', baseSha: 'abc123' },
  },
  userPreferences: { maxRetriesPerPhase: 2 },
}

test('round-trip: preserves every recorded field', () => {
  const r = validatePipelineState(RECORDED_STATE)
  assert.ok(isOk(r), r.error?.reason)
  assert.deepEqual({ ...r.value }, RECORDED_STATE)
})

// ─── no older format is migrated ──────────────────────────────────────────────

test('older formats: a field outside the schema is rejected, not dropped or migrated', () => {
  const older = [
    [{ difficulty: 'simple' }, 'difficulty is not a known field'],
    [{ reviewerVerdicts: { DISCOVER: 'APPROVED' } }, 'reviewerVerdicts is not a known field'],
    [{ reviewArtifactsLegacy: ['reviews/r.md'] }, 'reviewArtifactsLegacy is not a known field'],
    [{ entryPoint: { skipPhases: [] } }, 'entryPoint is not a known field'],
    [{ userPreferences: { reviewCadence: 'weekly' } }, 'userPreferences.reviewCadence is not a known field'],
    [{ skraftPlanFile: 'plans/us1.md' }, 'skraftPlanFile is not a known field'],
    [{ entryMode: 'from-issue' }, 'entryMode is not a known field'],
    [{ referencesProcessed: [] }, 'referencesProcessed is not a known field'],
    [{ userPreferences: { autonomyTier: 'full' } }, 'userPreferences.autonomyTier is not a known field'],
    [{ userPreferences: { phaseOrder: ['RESEARCH'] } }, 'userPreferences.phaseOrder is not a known field'],
    [{ issueNumber: 47 }, 'issueNumber is not a known field'],
    [{ nextActions: [] }, 'nextActions is not a known field'],
    [{ neighborPlanners: {} }, 'neighborPlanners is not a known field'],
  ]
  for (const [fields, reason] of older) {
    const r = validatePipelineState({ currentPhase: 'DISCOVER', ...fields })
    assert.ok(isErr(r), reason)
    assert.equal(r.error.code, 'INVALID_STATE')
    assert.equal(r.error.reason, reason)
  }
})

test('older formats: flat-array artefact lists are rejected, not kept under a Legacy key', () => {
  const r = validatePipelineState({ currentPhase: 'DISCOVER', phaseArtifacts: ['b.md'], reviewArtifacts: ['a.md'] })
  assert.ok(isErr(r))
  assert.deepEqual(r.error.fields, ['phaseArtifacts', 'reviewArtifacts'])
  assert.equal(r.error.reason, 'phaseArtifacts must be an object; reviewArtifacts must be an object')
})

test('older formats: ADR verdicts recorded as bare strings are rejected', () => {
  const r = validatePipelineState({
    currentPhase: 'DISTILL',
    adrRatification: { checkpointStatus: 'resolved', pending: [], ratified: ['ADR-002'] },
  })
  assert.ok(isErr(r))
  assert.equal(r.error.reason, 'adrRatification.ratified[0] must be an object')
})
