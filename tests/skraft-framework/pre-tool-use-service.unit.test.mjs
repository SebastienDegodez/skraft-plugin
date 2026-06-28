import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPreToolUseService } from '../../plugins/src/application/pre-tool-use-service.mjs'

// Application-boundary tests for routes the immutable acceptance suite cannot observe:
// the PIPELINE_COMPLETE block route, and the fail-closed wrap when clock/auditWriter throw.
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

const PROJECT_SLUG = 'us3-g1-dispatch-order-guard'
const FIXED_NOW = '2026-06-28T12:00:00.000Z'
const fixedClock = { now: () => FIXED_NOW }
const stateReaderReturning = (raw) => ({ read: async () => raw })
const collectingAuditWriter = () => {
  const entries = []
  return { entries, write: async (entry) => { entries.push(entry) } }
}

// PIPELINE_COMPLETE route — APPROVED on the final phase blocks (no forward agent), code PIPELINE_COMPLETE.
test('blocks a dispatch after the final phase is APPROVED and audits PIPELINE_COMPLETE', async () => {
  const state = { currentPhase: 'DELIVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const audit = collectingAuditWriter()
  const service = createPreToolUseService({ stateReader: stateReaderReturning(state), auditWriter: audit, config: CONFIG, clock: fixedClock })

  const result = await service.handle({ requestedAgent: 'software-engineer', projectSlug: PROJECT_SLUG })

  assert.equal(result.decision, 'block')
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].code, 'PIPELINE_COMPLETE')
  assert.equal(audit.entries[0].expectedAgent, null)
  assert.equal(audit.entries[0].decision, 'DENY')
})

// Fail-closed: a clock that throws still blocks (never allow).
test('blocks when the clock throws (fail-closed)', async () => {
  const throwingClock = { now: () => { throw new Error('clock failed') } }
  const audit = collectingAuditWriter()
  const state = { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const service = createPreToolUseService({ stateReader: stateReaderReturning(state), auditWriter: audit, config: CONFIG, clock: throwingClock })

  const result = await service.handle({ requestedAgent: 'solution-architect', projectSlug: PROJECT_SLUG })

  assert.equal(result.decision, 'block')
})

// Fail-closed: an audit writer that throws still blocks (swallow the audit error).
test('blocks when the audit writer throws (fail-closed)', async () => {
  const throwingWriter = { write: async () => { throw new Error('disk full') } }
  const state = { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const service = createPreToolUseService({ stateReader: stateReaderReturning(state), auditWriter: throwingWriter, config: CONFIG, clock: fixedClock })

  const result = await service.handle({ requestedAgent: 'solution-architect', projectSlug: PROJECT_SLUG })

  assert.equal(result.decision, 'block')
})
