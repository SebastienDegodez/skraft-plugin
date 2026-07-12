import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTransition } from '../../plugins/src/domain/state-machine.mjs'

// Minimal valid pipeline state builder
const mkState = (overrides = {}) => ({
  currentPhase: 'DISCOVER',
  phasesCompleted: [],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: {},
  difficulty: null,
  userPreferences: { maxRetriesPerPhase: 2 },
  ...overrides,
})

// ─── INVALID_STATE ────────────────────────────────────────────────────────────
test('state-machine: INVALID_STATE when input is null', () => {
  const r = applyTransition(null, { type: 'ADVANCE', targetPhase: 'DISCUSS' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_STATE')
})

test('state-machine: INVALID_STATE when currentPhase is missing', () => {
  const r = applyTransition({}, { type: 'RECORD_VERDICT', phase: 'X', verdict: 'APPROVED' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_STATE')
})

test('state-machine: INVALID_STATE for unknown event type', () => {
  const r = applyTransition(mkState(), { type: 'TELEPORT' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_STATE')
  assert.ok(r.error.reason.includes('TELEPORT'), `reason must name the event type: ${r.error.reason}`)
})

// ─── TERMINAL_STATE ───────────────────────────────────────────────────────────
test('state-machine: TERMINAL_STATE on any event when currentPhase is DONE', () => {
  for (const type of ['ADVANCE', 'RECORD_VERDICT', 'RECORD_ARTIFACT', 'SET_DIFFICULTY', 'INCR_RETRY', 'INCR_REWORK', 'CLOSE_PHASE']) {
    const r = applyTransition(mkState({ currentPhase: 'DONE' }), { type, targetPhase: 'DISCOVER', phase: 'X', verdict: 'APPROVED', value: 'easy', path: 'p' })
    assert.equal(r.ok, false, `${type} must be rejected`)
    assert.equal(r.error.code, 'TERMINAL_STATE', `${type} must yield TERMINAL_STATE`)
    assert.ok(r.error.reason.length > 0, `TERMINAL_STATE reason must not be empty for ${type}`)
  }
})

// ─── ADVANCE ──────────────────────────────────────────────────────────────────
test('state-machine ADVANCE: VERDICT_NOT_APPROVED when no verdict for currentPhase', () => {
  const r = applyTransition(mkState(), { type: 'ADVANCE', targetPhase: 'DISCUSS' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'VERDICT_NOT_APPROVED')
})

test('state-machine ADVANCE: VERDICT_NOT_APPROVED when verdict is CHANGES_REQUESTED', () => {
  const r = applyTransition(
    mkState({ verdicts: { DISCOVER: 'CHANGES_REQUESTED' } }),
    { type: 'ADVANCE', targetPhase: 'DISCUSS' }
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'VERDICT_NOT_APPROVED')
  assert.ok(r.error.reason.includes('DISCOVER'), `reason must name the phase: ${r.error.reason}`)
})

test('state-machine ADVANCE: ILLEGAL_PHASE_SKIP (DISCOVER → DESIGN, expects DISCUSS)', () => {
  const r = applyTransition(
    mkState({ verdicts: { DISCOVER: 'APPROVED' } }),
    { type: 'ADVANCE', targetPhase: 'DESIGN' }
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'ILLEGAL_PHASE_SKIP')
  assert.ok(r.error.reason.includes('expected DISCUSS'), `reason: ${r.error.reason}`)
  assert.ok(r.error.reason.includes('got DESIGN'), `reason: ${r.error.reason}`)
})

test('state-machine ADVANCE: DISCOVER → DISCUSS sets currentPhase and appends phasesCompleted', () => {
  const r = applyTransition(
    mkState({ verdicts: { DISCOVER: 'APPROVED' } }),
    { type: 'ADVANCE', targetPhase: 'DISCUSS' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.currentPhase, 'DISCUSS')
  assert.deepEqual([...r.value.phasesCompleted], ['DISCOVER'])
})

test('state-machine ADVANCE: DISCUSS → DESIGN (covers DESIGN in PHASE_ORDER)', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCUSS', phasesCompleted: ['DISCOVER'], verdicts: { DISCUSS: 'APPROVED' } }),
    { type: 'ADVANCE', targetPhase: 'DESIGN' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.currentPhase, 'DESIGN')
})

test('state-machine ADVANCE: DESIGN → DISTILL (covers DISTILL in PHASE_ORDER)', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DESIGN', phasesCompleted: ['DISCOVER', 'DISCUSS'], verdicts: { DESIGN: 'APPROVED' } }),
    { type: 'ADVANCE', targetPhase: 'DISTILL' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.currentPhase, 'DISTILL')
})

test('state-machine ADVANCE: DISTILL → DELIVER (covers DELIVER in PHASE_ORDER)', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISTILL', phasesCompleted: ['DISCOVER', 'DISCUSS', 'DESIGN'], verdicts: { DISTILL: 'APPROVED' } }),
    { type: 'ADVANCE', targetPhase: 'DELIVER' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.currentPhase, 'DELIVER')
})

test('state-machine ADVANCE: DELIVER → DONE (last phase → terminal state)', () => {
  const r = applyTransition(
    mkState({
      currentPhase: 'DELIVER',
      phasesCompleted: ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL'],
      verdicts: { DELIVER: 'APPROVED' },
    }),
    { type: 'ADVANCE', targetPhase: 'DONE' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.currentPhase, 'DONE')
  assert.ok([...r.value.phasesCompleted].includes('DELIVER'))
})

test('state-machine ADVANCE: uses custom phaseOrder from userPreferences', () => {
  const r = applyTransition(
    mkState({
      currentPhase: 'ALPHA',
      verdicts: { ALPHA: 'APPROVED' },
      userPreferences: { maxRetriesPerPhase: 2, phaseOrder: ['ALPHA', 'BETA'] },
    }),
    { type: 'ADVANCE', targetPhase: 'BETA' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.currentPhase, 'BETA')
})

// ─── RECORD_VERDICT ───────────────────────────────────────────────────────────
test('state-machine RECORD_VERDICT: sets verdict without advancing currentPhase', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCUSS', phasesCompleted: ['DISCOVER'] }),
    { type: 'RECORD_VERDICT', phase: 'DISCUSS', verdict: 'APPROVED' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.verdicts.DISCUSS, 'APPROVED')
  assert.equal(r.value.currentPhase, 'DISCUSS')
})

test('state-machine RECORD_VERDICT: sets CHANGES_REQUESTED verdict', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCOVER' }),
    { type: 'RECORD_VERDICT', phase: 'DISCOVER', verdict: 'CHANGES_REQUESTED' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.verdicts.DISCOVER, 'CHANGES_REQUESTED')
})

// ─── RECORD_ARTIFACT ──────────────────────────────────────────────────────────
test('state-machine RECORD_ARTIFACT: appends to empty phaseArtifacts[phase]', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCUSS' }),
    { type: 'RECORD_ARTIFACT', phase: 'DISCUSS', path: 'plans/story.md' }
  )
  assert.equal(r.ok, true)
  assert.deepEqual([...r.value.phaseArtifacts.DISCUSS], ['plans/story.md'])
})

test('state-machine RECORD_ARTIFACT: appends to existing phaseArtifacts[phase]', () => {
  const r = applyTransition(
    mkState({ phaseArtifacts: { DISCUSS: ['plans/story.md'] } }),
    { type: 'RECORD_ARTIFACT', phase: 'DISCUSS', path: 'plans/ac.md' }
  )
  assert.equal(r.ok, true)
  assert.deepEqual([...r.value.phaseArtifacts.DISCUSS], ['plans/story.md', 'plans/ac.md'])
})

test('state-machine RECORD_ARTIFACT: APPEND_ONLY_VIOLATION when _testForcePhasesCompleted is shorter', () => {
  const r = applyTransition(
    mkState({ phasesCompleted: ['DISCOVER', 'DISCUSS'] }),
    { type: 'RECORD_ARTIFACT', phase: 'DISCUSS', path: 'p.md', _testForcePhasesCompleted: ['DISCOVER'] }
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'APPEND_ONLY_VIOLATION')
  assert.ok(r.error.reason.includes('phasesCompleted'), `reason must name phasesCompleted: ${r.error.reason}`)
})

test('state-machine RECORD_ARTIFACT: _testForcePhasesCompleted equal length does NOT reject', () => {
  const r = applyTransition(
    mkState({ phasesCompleted: ['DISCOVER', 'DISCUSS'] }),
    { type: 'RECORD_ARTIFACT', phase: 'DISCUSS', path: 'p.md', _testForcePhasesCompleted: ['DISCOVER', 'DISCUSS'] }
  )
  assert.equal(r.ok, true)
})

// ─── RECORD_REVIEW_ARTIFACT ───────────────────────────────────────────────────
test('state-machine RECORD_REVIEW_ARTIFACT: appends to empty reviewArtifacts[phase]', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCOVER' }),
    { type: 'RECORD_REVIEW_ARTIFACT', phase: 'DISCOVER', path: 'reviews/r1.md' }
  )
  assert.equal(r.ok, true)
  assert.deepEqual([...r.value.reviewArtifacts.DISCOVER], ['reviews/r1.md'])
})

test('state-machine RECORD_REVIEW_ARTIFACT: APPEND_ONLY_VIOLATION when _testForceReviewArtifacts is shorter', () => {
  const r = applyTransition(
    mkState({ reviewArtifacts: { DISCOVER: ['r1.md'] } }),
    { type: 'RECORD_REVIEW_ARTIFACT', phase: 'DISCOVER', path: 'r2.md', _testForceReviewArtifacts: [] }
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'APPEND_ONLY_VIOLATION')
})

test('state-machine RECORD_REVIEW_ARTIFACT: _testForceReviewArtifacts equal length does NOT reject', () => {
  const r = applyTransition(
    mkState({ reviewArtifacts: { DISCOVER: ['r1.md'] } }),
    { type: 'RECORD_REVIEW_ARTIFACT', phase: 'DISCOVER', path: 'r2.md', _testForceReviewArtifacts: ['r1.md'] }
  )
  assert.equal(r.ok, true)
})

// ─── CLOSE_PHASE ──────────────────────────────────────────────────────────────
test('state-machine CLOSE_PHASE: records verdict, appends review artifact, and advances in one write', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCUSS', phasesCompleted: ['DISCOVER'] }),
    { type: 'CLOSE_PHASE', phase: 'DISCUSS', verdict: 'APPROVED', path: 'reviews/manual-close.md' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.verdicts.DISCUSS, 'APPROVED')
  assert.deepEqual([...r.value.reviewArtifacts.DISCUSS], ['reviews/manual-close.md'])
  assert.equal(r.value.currentPhase, 'DESIGN')
  assert.deepEqual([...r.value.phasesCompleted], ['DISCOVER', 'DISCUSS'])
})

test('state-machine CLOSE_PHASE: DELIVER closure advances to DONE', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DELIVER', phasesCompleted: ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL'] }),
    { type: 'CLOSE_PHASE', phase: 'DELIVER', verdict: 'APPROVED', path: 'reviews/manual-close.md' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.currentPhase, 'DONE')
})

test('state-machine CLOSE_PHASE: omitted path skips the review artifact append', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCUSS', phasesCompleted: ['DISCOVER'] }),
    { type: 'CLOSE_PHASE', phase: 'DISCUSS', verdict: 'APPROVED' }
  )
  assert.equal(r.ok, true)
  assert.deepEqual(r.value.reviewArtifacts, {})
  assert.equal(r.value.currentPhase, 'DESIGN')
})

test('state-machine CLOSE_PHASE: PHASE_MISMATCH when phase differs from currentPhase', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCUSS' }),
    { type: 'CLOSE_PHASE', phase: 'DESIGN', verdict: 'APPROVED', path: 'reviews/manual-close.md' }
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'PHASE_MISMATCH')
  assert.ok(r.error.reason.includes('DESIGN') && r.error.reason.includes('DISCUSS'), `reason: ${r.error.reason}`)
})

test('state-machine CLOSE_PHASE: VERDICT_NOT_APPROVED when verdict is not APPROVED', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCUSS' }),
    { type: 'CLOSE_PHASE', phase: 'DISCUSS', verdict: 'CHANGES_REQUESTED', path: 'reviews/manual-close.md' }
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'VERDICT_NOT_APPROVED')
  assert.equal(r.value, undefined)
})

// ─── SET_DIFFICULTY ───────────────────────────────────────────────────────────
test('state-machine SET_DIFFICULTY: sets difficulty on null state', () => {
  const r = applyTransition(mkState(), { type: 'SET_DIFFICULTY', value: 'medium-hard' })
  assert.equal(r.ok, true)
  assert.equal(r.value.difficulty, 'medium-hard')
})

test('state-machine SET_DIFFICULTY: IMMUTABLE_FIELD when difficulty already set', () => {
  const r = applyTransition(
    mkState({ difficulty: 'easy' }),
    { type: 'SET_DIFFICULTY', value: 'hard' }
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IMMUTABLE_FIELD')
  assert.ok(r.error.reason.length > 0, 'IMMUTABLE_FIELD reason must not be empty')
})

// ─── INCR_RETRY ───────────────────────────────────────────────────────────────
test('state-machine INCR_RETRY: increments retryCount from zero', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCUSS' }),
    { type: 'INCR_RETRY', phase: 'DISCUSS' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.retryCount.DISCUSS, 1)
})

test('state-machine INCR_RETRY: increments retryCount from 1', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCUSS', retryCount: { DISCUSS: 1 } }),
    { type: 'INCR_RETRY', phase: 'DISCUSS' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.retryCount.DISCUSS, 2)
})

test('state-machine INCR_RETRY: RETRY_EXHAUSTED at ceiling (maxRetriesPerPhase=2)', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DISCUSS', retryCount: { DISCUSS: 2 } }),
    { type: 'INCR_RETRY', phase: 'DISCUSS' }
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'RETRY_EXHAUSTED')
  assert.ok(r.error.reason.includes('DISCUSS'), `reason must name the phase: ${r.error.reason}`)
})

test('state-machine INCR_RETRY: uses default maxRetries=2 when userPreferences absent', () => {
  const s = {
    currentPhase: 'DISCOVER',
    phasesCompleted: [],
    verdicts: {},
    retryCount: { DISCOVER: 2 },
    phaseArtifacts: {},
    reviewArtifacts: {},
    difficulty: null,
    // no userPreferences
  }
  const r = applyTransition(s, { type: 'INCR_RETRY', phase: 'DISCOVER' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'RETRY_EXHAUSTED')
})

// ─── INCR_REWORK ──────────────────────────────────────────────────────────────
test('state-machine INCR_REWORK: increments reworkCount from zero, defaults findings to 1', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DELIVER' }),
    { type: 'INCR_REWORK', phase: 'DELIVER' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.reworkCount.DELIVER, 1)
  assert.equal(r.value.findingsResolved.DELIVER, 1)
})

test('state-machine INCR_REWORK: accumulates reworkCount and findingsResolved across passes', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DELIVER', reworkCount: { DELIVER: 1 }, findingsResolved: { DELIVER: 5 } }),
    { type: 'INCR_REWORK', phase: 'DELIVER', findings: 7 }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.reworkCount.DELIVER, 2)
  assert.equal(r.value.findingsResolved.DELIVER, 12)
})

test('state-machine INCR_REWORK: is uncapped — no RETRY_EXHAUSTED regardless of count', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DELIVER', reworkCount: { DELIVER: 50 } }),
    { type: 'INCR_REWORK', phase: 'DELIVER' }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.reworkCount.DELIVER, 51)
})

test('state-machine INCR_REWORK: negative findings falls back to default of 1', () => {
  const r = applyTransition(
    mkState({ currentPhase: 'DELIVER' }),
    { type: 'INCR_REWORK', phase: 'DELIVER', findings: -3 }
  )
  assert.equal(r.ok, true)
  assert.equal(r.value.findingsResolved.DELIVER, 1)
})

// ─── passthrough fidelity: orchestrator-owned fields survive every transition ──
// Regression pair for the schema round-trip fix: applyTransition validates+coerces
// via validatePipelineState, so preserved fields must reach the returned state and
// not be dropped by the transition spread.
const mkRichState = (overrides = {}) => mkState({
  projectSlug: 'us9-demo',
  issueNumber: 99,
  entryPoint: { skipPhases: [], handoffSource: null, handoffArtifacts: [] },
  adrRatification: { checkpointStatus: 'pending', pending: ['adr-1'], ratified: [] },
  neighborPlanners: { securityPlanFile: null, raiPlanFile: null, ssscPlanFile: null },
  ...overrides,
})

const assertRichPreserved = (value) => {
  assert.equal(value.projectSlug, 'us9-demo', 'projectSlug preserved')
  assert.equal(value.issueNumber, 99, 'issueNumber preserved')
  assert.deepEqual(value.entryPoint, { skipPhases: [], handoffSource: null, handoffArtifacts: [] }, 'entryPoint preserved')
  assert.deepEqual(value.adrRatification, { checkpointStatus: 'pending', pending: ['adr-1'], ratified: [] }, 'adrRatification preserved')
}

test('passthrough: RECORD_VERDICT preserves orchestrator-owned fields', () => {
  const r = applyTransition(mkRichState(), { type: 'RECORD_VERDICT', phase: 'DISCOVER', verdict: 'APPROVED' })
  assert.equal(r.ok, true)
  assertRichPreserved(r.value)
  assert.equal(r.value.verdicts.DISCOVER, 'APPROVED')
})

test('passthrough: ADVANCE preserves orchestrator-owned fields', () => {
  const r = applyTransition(mkRichState({ verdicts: { DISCOVER: 'APPROVED' } }), { type: 'ADVANCE', targetPhase: 'DISCUSS' })
  assert.equal(r.ok, true)
  assertRichPreserved(r.value)
  assert.equal(r.value.currentPhase, 'DISCUSS')
})

test('passthrough: INCR_RETRY preserves orchestrator-owned fields', () => {
  const r = applyTransition(mkRichState(), { type: 'INCR_RETRY', phase: 'DISCOVER' })
  assert.equal(r.ok, true)
  assertRichPreserved(r.value)
  assert.equal(r.value.retryCount.DISCOVER, 1)
})

// ─── RESOLVE_STALE (US13 recovery) ─────────────────────────────────────────────
test('state-machine: RESOLVE_STALE resets stuck currentPhase retryCount to 0', () => {
  const state = mkState({ currentPhase: 'DESIGN', retryCount: { DESIGN: 2 }, verdicts: { DESIGN: 'CHANGES_REQUESTED' } })
  const r = applyTransition(state, { type: 'RESOLVE_STALE' })
  assert.equal(r.ok, true)
  assert.equal(r.value.retryCount.DESIGN, 0)
})

test('state-machine: RESOLVE_STALE targets an explicit phase', () => {
  const state = mkState({ currentPhase: 'DESIGN', retryCount: { DISCUSS: 2 }, verdicts: { DISCUSS: 'CHANGES_REQUESTED' } })
  const r = applyTransition(state, { type: 'RESOLVE_STALE', phase: 'DISCUSS' })
  assert.equal(r.ok, true)
  assert.equal(r.value.retryCount.DISCUSS, 0)
})

test('state-machine: RESOLVE_STALE rejects a non-stale phase (retries below cap)', () => {
  const state = mkState({ currentPhase: 'DESIGN', retryCount: { DESIGN: 1 } })
  const r = applyTransition(state, { type: 'RESOLVE_STALE' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'NOT_STALE')
})

test('state-machine: RESOLVE_STALE rejects an APPROVED phase even if retries exhausted', () => {
  const state = mkState({ currentPhase: 'DESIGN', retryCount: { DESIGN: 2 }, verdicts: { DESIGN: 'APPROVED' } })
  const r = applyTransition(state, { type: 'RESOLVE_STALE' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'NOT_STALE')
})

test('passthrough: INCR_REWORK preserves orchestrator-owned fields', () => {
  const r = applyTransition(mkRichState(), { type: 'INCR_REWORK', phase: 'DISCOVER' })
  assert.equal(r.ok, true)
  assertRichPreserved(r.value)
  assert.equal(r.value.reworkCount.DISCOVER, 1)
  assert.equal(r.value.findingsResolved.DISCOVER, 1)
})
