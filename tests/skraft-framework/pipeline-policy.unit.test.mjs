import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOk, isErr } from '../../plugins/src/domain/result.mjs'
import { expectedNextAgent } from '../../plugins/src/domain/pipeline-policy.mjs'

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
})

// D2 — PIPELINE_COMPLETE: APPROVED on the last phase → no forward agent derivable.
test('D2: approved on the final phase leaves no next agent', () => {
  const state = { currentPhase: 'DELIVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, CONFIG)
  assert.ok(isErr(result))
  assert.equal(result.error.code, 'PIPELINE_COMPLETE')
})

// D3 — missing/malformed phaseAgents guards (fail-closed contract, ADR-004).
test('D3: currentPhase present in phaseOrder but absent from phaseAgents returns INVALID_STATE', () => {
  const badConfig = { ...CONFIG, phaseAgents: {} }
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
})

test('D3: nextPhase absent from phaseAgents in ADVANCE branch returns INVALID_STATE', () => {
  const badConfig = { ...CONFIG, phaseAgents: { DISCOVER: { specialist: 'backlog-discoverer', reviewer: 'backlog-discoverer-reviewer' } } }
  const state = { currentPhase: 'DISCOVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const result = expectedNextAgent(state, badConfig)
  assert.ok(isErr(result))
  assert.equal(result.error.code, 'INVALID_STATE')
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
    } else {
      assert.ok(isOk(result))
      assert.equal(result.value.stage, stage)
      assert.equal(result.value.agent, agent)
    }
  })
}
