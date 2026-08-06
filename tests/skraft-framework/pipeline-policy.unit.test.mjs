import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOk, isErr } from '../../plugins/skraft-framework/src/domain/result.mjs'
import { expectedNextAgent, evaluateDispatch, isPipelineAgent, nextPhaseAfter } from '../../plugins/skraft-framework/src/domain/pipeline-policy.mjs'

// Inner-loop domain tests for branches the immutable acceptance suite cannot observe
// (Mandate 4 gate a — branch_unreachable_via_AC) plus the retry-budget boundary sweep
// (gate b — combinatorial_economy). The retry budget of 3 comes from the published config.
const CONFIG = {
  phaseOrder: ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL', 'DELIVER'],
  phaseAgents: {
    DISCOVER: { specialist: 'backlog-discoverer', reviewer: 'backlog-discoverer-reviewer' },
    DISCUSS: { specialist: 'backlog-planner', reviewer: 'backlog-planner-reviewer' },
    DESIGN: { specialist: 'solution-architect', reviewer: 'solution-architect-reviewer' },
    DISTILL: { specialist: 'acceptance-designer', reviewer: 'acceptance-designer-reviewer' },
    DELIVER: { specialist: 'software-engineer', reviewer: 'software-engineer-reviewer' }
  }
}

// D4 — SPECIALIST stage: specialist has not run yet (pins stage name + agent).
test('D4: specialistDone false returns stage SPECIALIST with the phase specialist', () => {
  const state = { currentPhase: 'DISCOVER', specialistDone: false, reviewerVerdict: null, retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, CONFIG)
  assert.ok(isOk(result))
  assert.equal(result.value.stage, 'SPECIALIST')
  assert.equal(result.value.agent, 'backlog-discoverer')
  assert.ok(result.value.reason.includes('specialist must run'))
})

// currentPhase absent from phaseOrder entirely (distinct from D3's "absent from phaseAgents"
// below): the very first guard. Untested until now — kills the StringLiteral/BlockStatement/
// ConditionalExpression/ObjectLiteral mutants on that branch.
test('a currentPhase absent from the published phaseOrder returns INVALID_STATE with a descriptive reason', () => {
  const state = { currentPhase: 'GHOST_PHASE', specialistDone: false, reviewerVerdict: null, retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, CONFIG)
  assert.ok(isErr(result))
  assert.equal(result.error.code, 'INVALID_STATE')
  assert.ok(result.error.reason.includes('GHOST_PHASE'))
  assert.ok(result.error.reason.includes('not in the published phase order'))
})

// nextPhaseAfter — the loop-bound equivalence: the loop's own `index < order.length` and the
// final ternary's `index < order.length` are two independent AST nodes reading the same
// invariant. Pinning the boundary at the LAST phase (no phases left to skip to) documents the
// contract even though a `<=` mutation on the loop condition alone cannot change the ternary's
// answer (equivalent mutant — see pipeline-policy.mjs comment).
test('nextPhaseAfter: returns null when currentPhase is already the last phase in the order', () => {
  assert.equal(nextPhaseAfter('DELIVER', CONFIG, []), null)
})

// ─── reviewer === null (S3.1 — reviewer-less phase, e.g. RESEARCH) ──────────────
// A phase can declare no reviewer at all (config.phaseAgents[phase].reviewer === null).
// Specialist completion is then sufficient to advance — there is no REVIEWER stage,
// no verdict gate, and no retry loop for that phase.
const NO_REVIEWER_CONFIG = {
  phaseOrder: ['RESEARCH', 'DESIGN'],
  phaseAgents: {
    RESEARCH: { specialist: 'solution-researcher', reviewer: null },
    DESIGN: { specialist: 'solution-architect', reviewer: 'solution-architect-reviewer' }
  }
}

test('reviewer-less phase: specialist not yet run still returns stage SPECIALIST', () => {
  const state = { currentPhase: 'RESEARCH', specialistDone: false, reviewerVerdict: null, retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, NO_REVIEWER_CONFIG)
  assert.ok(isOk(result))
  assert.equal(result.value.stage, 'SPECIALIST')
  assert.equal(result.value.agent, 'solution-researcher')
})

test('reviewer-less phase: specialist done skips the REVIEWER stage and advances directly', () => {
  const state = { currentPhase: 'RESEARCH', specialistDone: true, reviewerVerdict: null, retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, NO_REVIEWER_CONFIG)
  assert.ok(isOk(result))
  assert.equal(result.value.stage, 'ADVANCE')
  assert.equal(result.value.agent, 'solution-architect')
})

test('reviewer-less phase: isPipelineAgent is true for the specialist and false for an arbitrary reviewer name', () => {
  assert.equal(isPipelineAgent('solution-researcher', NO_REVIEWER_CONFIG), true)
  assert.equal(isPipelineAgent('solution-researcher-reviewer', NO_REVIEWER_CONFIG), false)
})

// D5 — ADVANCE stage: approved on non-final phase advances to next specialist.
test('D5: APPROVED on non-final phase returns stage ADVANCE with next phase specialist', () => {
  const state = { currentPhase: 'DISCOVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, CONFIG)
  assert.ok(isOk(result))
  assert.equal(result.value.stage, 'ADVANCE')
  assert.equal(result.value.agent, 'backlog-planner')
  assert.ok(result.value.reason.includes('advance to'))
})

// D6 — skipPhases: a phase in skipPhases is skipped when advancing.
test('D6: skipPhases skips the specified phase and advances to the next eligible specialist', () => {
  const state = { currentPhase: 'DISCOVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: ['DISCUSS'] }
  const result = expectedNextAgent(state, CONFIG)
  assert.ok(isOk(result))
  assert.equal(result.value.stage, 'ADVANCE')
  assert.equal(result.value.agent, 'solution-architect')
})

// D1 — REVIEWER stage: specialist done, no verdict yet → the phase reviewer runs next.
test('D1: specialist done and no verdict yet expects the phase reviewer', () => {
  const state = { currentPhase: 'DESIGN', specialistDone: true, reviewerVerdict: null, retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, CONFIG)
  assert.ok(isOk(result))
  assert.equal(result.value.stage, 'REVIEWER')
  assert.equal(result.value.agent, 'solution-architect-reviewer')
  assert.ok(result.value.reason.includes('reviewer must run'))
})

// D2 — PIPELINE_COMPLETE: APPROVED on the last phase → no forward agent derivable.
test('D2: approved on the final phase leaves no next agent', () => {
  const state = { currentPhase: 'DELIVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, CONFIG)
  assert.ok(isErr(result))
  assert.equal(result.error.code, 'PIPELINE_COMPLETE')
  assert.ok(result.error.reason.includes('DELIVER'))
})

// D3 — missing/malformed phaseAgents guards (fail-closed contract, ADR-004).
test('D3: currentPhase present in phaseOrder but absent from phaseAgents returns INVALID_STATE', () => {
  const badConfig = { ...CONFIG, phaseAgents: {} }
  const state = { currentPhase: 'DISCOVER', specialistDone: false, reviewerVerdict: null, retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, badConfig)
  assert.ok(isErr(result))
  assert.equal(result.error.code, 'INVALID_STATE')
})

test('D3: config.phaseAgents missing entirely (not just the phase key) does not throw and returns INVALID_STATE', () => {
  const badConfig = { phaseOrder: CONFIG.phaseOrder }
  const state = { currentPhase: 'DISCOVER', specialistDone: false, reviewerVerdict: null, retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, badConfig)
  assert.ok(isErr(result))
  assert.equal(result.error.code, 'INVALID_STATE')
})

test('D3: phaseAgents entry with non-string specialist returns INVALID_STATE', () => {
  const badConfig = { ...CONFIG, phaseAgents: { ...CONFIG.phaseAgents, DISCOVER: { specialist: 42, reviewer: 'backlog-discoverer-reviewer' } } }
  const state = { currentPhase: 'DISCOVER', specialistDone: false, reviewerVerdict: null, retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, badConfig)
  assert.ok(isErr(result))
  assert.equal(result.error.code, 'INVALID_STATE')
  assert.ok(result.error.reason.includes('DISCOVER'))
})

test('D3: phaseAgents entry with a non-string, non-null reviewer returns INVALID_STATE (reviewer must be a string or explicitly null)', () => {
  const badConfig = { ...CONFIG, phaseAgents: { ...CONFIG.phaseAgents, DISCOVER: { specialist: 'backlog-discoverer', reviewer: 42 } } }
  const state = { currentPhase: 'DISCOVER', specialistDone: false, reviewerVerdict: null, retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, badConfig)
  assert.ok(isErr(result))
  assert.equal(result.error.code, 'INVALID_STATE')
})

test('D3: nextPhase absent from phaseAgents in ADVANCE branch returns INVALID_STATE', () => {
  const badConfig = { ...CONFIG, phaseAgents: { DISCOVER: { specialist: 'backlog-discoverer', reviewer: 'backlog-discoverer-reviewer' } } }
  const state = { currentPhase: 'DISCOVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, badConfig)
  assert.ok(isErr(result))
  assert.equal(result.error.code, 'INVALID_STATE')
  assert.ok(result.error.reason.includes('DISCUSS'))
})

// Retry budget boundary (pins the default of 3 — kills off-by-one budget mutants).
const RETRY_ROWS = [
  { retries: 2, stage: 'RETRY', agent: 'acceptance-designer' },
  { retries: 3, exhausted: true }
]
for (const { retries, stage, agent, exhausted } of RETRY_ROWS) {
  test(`retry budget: ${retries} retries ${exhausted ? 'is exhausted' : 'is within budget'}`, () => {
    const state = { currentPhase: 'DISTILL', specialistDone: true, reviewerVerdict: 'CHANGES_REQUESTED', retries, skipPhases: [] }
    const result = expectedNextAgent(state, CONFIG)
    if (exhausted) {
      assert.ok(isErr(result))
      assert.equal(result.error.code, 'RETRY_EXHAUSTED')
      assert.ok(result.error.reason.includes('DISTILL'))
    } else {
      assert.ok(isOk(result))
      assert.equal(result.value.stage, stage)
      assert.equal(result.value.agent, agent)
      assert.ok(result.value.reason.includes('retries within the retry budget'))
    }
  })
}

// ─── isPipelineAgent + UNGOVERNED dispatch (t3 — active-pipeline-only relaxation) ──
// The phase-order guard governs ONLY agents that belong to a phase. Product-layer
// agents (invoked top-level) and workers (dispatched inside DELIVER) are ungoverned:
// they must never be denied for being "out of order" against the pipeline.

test('isPipelineAgent: true for a configured specialist and reviewer', () => {
  assert.equal(isPipelineAgent('solution-architect', CONFIG), true)
  assert.equal(isPipelineAgent('solution-architect-reviewer', CONFIG), true)
})

test('isPipelineAgent: false for a worker / unknown agent', () => {
  assert.equal(isPipelineAgent('contract-testing-worker', CONFIG), false)
  assert.equal(isPipelineAgent('nonexistent-agent', CONFIG), false)
})

test('isPipelineAgent: does not throw when config.phaseAgents is missing entirely', () => {
  const noAgentsConfig = { phaseOrder: ['DISCOVER'] }
  assert.equal(isPipelineAgent('anything', noAgentsConfig), false)
})

test('isPipelineAgent: does not throw when a phase in phaseOrder has no entry in phaseAgents', () => {
  const partialConfig = {
    phaseOrder: ['DISCOVER', 'DESIGN'],
    phaseAgents: { DESIGN: { specialist: 'solution-architect', reviewer: 'solution-architect-reviewer' } }
  }
  assert.equal(isPipelineAgent('unknown-agent', partialConfig), false)
  assert.equal(isPipelineAgent('solution-architect', partialConfig), true)
})

test('evaluateDispatch: an ungoverned agent is allowed with stage UNGOVERNED regardless of phase', () => {
  // Active pipeline mid-DELIVER; a worker dispatch must pass, not collide with phase order.
  const state = { currentPhase: 'DELIVER', specialistDone: true, reviewerVerdict: null, retries: 0, skipPhases: [] }
  const result = evaluateDispatch('contract-testing-worker', state, CONFIG)
  assert.ok(isOk(result))
  assert.equal(result.value.stage, 'UNGOVERNED')
  assert.equal(result.value.expectedAgent, null)
  assert.equal(result.value.requestedAgent, 'contract-testing-worker')
  assert.match(result.value.reason, /not.*governed by phase order/)
})

test('evaluateDispatch: a governed pipeline agent still enforces order (out-of-order denied)', () => {
  const state = { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const result = evaluateDispatch('acceptance-designer', state, CONFIG)
  assert.ok(isErr(result))
  assert.equal(result.error.code, 'OUT_OF_ORDER')
  assert.equal(result.error.expectedAgent, 'solution-architect')
})

test('evaluateDispatch: a governed pipeline agent that matches the expected agent is allowed', () => {
  const state = { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const result = evaluateDispatch('solution-architect', state, CONFIG)
  assert.ok(isOk(result))
  assert.equal(result.value.stage, 'ADVANCE')
})