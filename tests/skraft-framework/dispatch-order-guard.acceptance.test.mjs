import { test } from 'node:test'
import assert from 'node:assert/strict'

// Outer-loop boundary (Contract 3). Exercises pre-tool-use dispatch gate end-to-end.
// Acceptance values are immutable.
import { createPreToolUseService } from '../../plugins/skraft-framework/src/application/pre-tool-use-service.mjs'

// ── Published Language (config) — copied verbatim from plugins/skraft-framework/skraft-framework.config.json (#48).
// retryBudget intentionally omitted to exercise the policy default of 3 (AC-01 "max 3").
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

// ── In-memory driven adapters (Strategy A — no persistent I/O).
const stateReaderReturning = (raw) => ({ read: async (_slug) => raw })
const stateReaderThrowing = (err) => ({ read: async (_slug) => { throw err } })
const collectingAuditWriter = () => {
  const entries = []
  return { entries, write: async (entry) => { entries.push(entry) } }
}

// Drive the gate boundary-to-boundary through the PreToolUse handle(payload) entry.
const runGate = async ({ reader, requestedAgent, projectSlug = PROJECT_SLUG }) => {
  const audit = collectingAuditWriter()
  const service = createPreToolUseService({
    stateReader: reader,
    auditWriter: audit,
    config: CONFIG,
    clock: fixedClock
  })
  const result = await service.handle({ requestedAgent, projectSlug })
  return { result, entries: audit.entries }
}

// ───────────────────────────────────────────────────────────────────────────
// AC-01 — Dispatch decision follows the recorded pipeline state (rule table)
// ───────────────────────────────────────────────────────────────────────────

// Rows a, e, f — a dispatch that matches the expected next agent is ALLOWED.
const AC01_ALLOW_ROWS = [
  // a — DISCUSS, present, APPROVED, 0, [] → solution-architect ALLOW (advance to DESIGN specialist)
  { row: 'a', state: { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }, requestedAgent: 'solution-architect', expectedAgent: 'solution-architect' },
  // e — DISCUSS, present, APPROVED, 0, [DESIGN] → acceptance-designer ALLOW (DESIGN configured-skipped)
  { row: 'e', state: { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: ['DESIGN'] }, requestedAgent: 'acceptance-designer', expectedAgent: 'acceptance-designer' },
  // f — DISTILL, present, CHANGES_REQUESTED, 1, [] → acceptance-designer ALLOW (retry within budget)
  { row: 'f', state: { currentPhase: 'DISTILL', specialistDone: true, reviewerVerdict: 'CHANGES_REQUESTED', retries: 1, skipPhases: [] }, requestedAgent: 'acceptance-designer', expectedAgent: 'acceptance-designer' }
]

for (const { row, state, requestedAgent, expectedAgent } of AC01_ALLOW_ROWS) {
  test(`AC-01 row ${row}: conforming dispatch of ${requestedAgent} is allowed`, async () => {
    const { result, entries } = await runGate({ reader: stateReaderReturning(state), requestedAgent })

    assert.equal(result.decision, 'allow')

    assert.equal(entries.length, 1, 'exactly one DispatchEvaluated audit fact per evaluation (AC-03)')
    const audit = entries[0]
    assert.equal(audit.event, 'DispatchEvaluated')
    assert.equal(audit.projectSlug, PROJECT_SLUG)
    assert.equal(audit.requestedAgent, requestedAgent)
    assert.equal(audit.expectedAgent, expectedAgent)
    assert.equal(audit.decision, 'ALLOW')
    assert.equal(audit.code, 'CONFORMING')
    assert.equal(audit.evaluatedAt, FIXED_NOW)
  })
}

// Rows b, c, d — a dispatch that does not match is DENIED and the outcome NAMES the expected agent.
const AC01_DENY_ROWS = [
  // b — DISCUSS, present, APPROVED, 0, [] → acceptance-designer DENY (skipped DESIGN), expected solution-architect
  { row: 'b', state: { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }, requestedAgent: 'acceptance-designer', expectedAgent: 'solution-architect' },
  // c — DESIGN, absent, none, 0, [] → solution-architect-reviewer DENY (reviewer before specialist), expected solution-architect
  { row: 'c', state: { currentPhase: 'DESIGN', specialistDone: false, reviewerVerdict: null, retries: 0, skipPhases: [] }, requestedAgent: 'solution-architect-reviewer', expectedAgent: 'solution-architect' },
  // d — DISCUSS, present, CHANGES_REQUESTED, 1, [] → solution-architect DENY (advance only on APPROVED), expected backlog-planner
  { row: 'd', state: { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'CHANGES_REQUESTED', retries: 1, skipPhases: [] }, requestedAgent: 'solution-architect', expectedAgent: 'backlog-planner' }
]

for (const { row, state, requestedAgent, expectedAgent } of AC01_DENY_ROWS) {
  test(`AC-01 row ${row}: non-conforming dispatch of ${requestedAgent} is denied and names ${expectedAgent}`, async () => {
    const { result, entries } = await runGate({ reader: stateReaderReturning(state), requestedAgent })

    assert.equal(result.decision, 'deny')
    assert.ok(
      result.message.includes(expectedAgent),
      `denied-dispatch outcome must name the expected next agent ${expectedAgent}`
    )

    assert.equal(entries.length, 1)
    const audit = entries[0]
    assert.equal(audit.event, 'DispatchEvaluated')
    assert.equal(audit.requestedAgent, requestedAgent)
    assert.equal(audit.expectedAgent, expectedAgent)
    assert.equal(audit.decision, 'DENY')
    assert.equal(audit.code, 'OUT_OF_ORDER')
    assert.equal(audit.evaluatedAt, FIXED_NOW)
  })
}

// Row g — DISTILL, present, CHANGES_REQUESTED, 3, [] → acceptance-designer BLOCK (retry budget exhausted → escalate)
test('AC-01 row g: a retry once the budget is exhausted is blocked and signals escalation', async () => {
  const state = { currentPhase: 'DISTILL', specialistDone: true, reviewerVerdict: 'CHANGES_REQUESTED', retries: 3, skipPhases: [] }
  const { result, entries } = await runGate({ reader: stateReaderReturning(state), requestedAgent: 'acceptance-designer' })

  assert.equal(result.decision, 'block')

  assert.equal(entries.length, 1)
  const audit = entries[0]
  assert.equal(audit.requestedAgent, 'acceptance-designer')
  assert.equal(audit.expectedAgent, null, 'no forward agent is derivable once the retry budget is exhausted')
  assert.equal(audit.decision, 'DENY')
  assert.equal(audit.code, 'RETRY_EXHAUSTED')
})

// ───────────────────────────────────────────────────────────────────────────
// AC-02 — Out-of-sequence dispatch is blocked BEFORE the sub-agent executes
// ───────────────────────────────────────────────────────────────────────────

test('AC-02: out-of-sequence dispatch is denied before acceptance-designer runs and names solution-architect', async () => {
  // State: phase DISCUSS, reviewer verdict APPROVED. Request: DISTILL specialist (acceptance-designer), skipping DESIGN.
  const state = { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const { result, entries } = await runGate({ reader: stateReaderReturning(state), requestedAgent: 'acceptance-designer' })

  // Block precedes execution: the gate returns a non-allow decision, so acceptance-designer never starts
  // and produces no DISTILL artefact (observable only as: the dispatch was not allowed).
  assert.notEqual(result.decision, 'allow', 'the skipped agent must not be permitted to start')
  assert.equal(result.decision, 'deny')
  assert.ok(
    result.message.includes('solution-architect'),
    'the blocked-dispatch outcome names the expected next agent solution-architect'
  )

  assert.equal(entries.length, 1)
  assert.equal(entries[0].expectedAgent, 'solution-architect')
  assert.equal(entries[0].decision, 'DENY')
})

// ───────────────────────────────────────────────────────────────────────────
// AC-03 — Decision is deterministic from recorded state and is audited
// ───────────────────────────────────────────────────────────────────────────

test('AC-03: the same dispatch against unchanged state yields the identical decision twice with one audit per attempt', async () => {
  const state = { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
  const audit = collectingAuditWriter()
  const service = createPreToolUseService({ stateReader: stateReaderReturning(state), auditWriter: audit, config: CONFIG, clock: fixedClock })

  const first = await service.handle({ requestedAgent: 'solution-architect', projectSlug: PROJECT_SLUG })
  const second = await service.handle({ requestedAgent: 'solution-architect', projectSlug: PROJECT_SLUG })

  assert.equal(first.decision, 'allow')
  assert.equal(second.decision, first.decision, 'no run-to-run variation against unchanged state')
  assert.equal(audit.entries.length, 2, 'one audit fact recorded per attempt')
})

// One audit record per evaluation — on ALLOW and on DENY.
const AC03_AUDIT_ROWS = [
  { requestedAgent: 'solution-architect', decision: 'allow', auditDecision: 'ALLOW' },
  { requestedAgent: 'acceptance-designer', decision: 'deny', auditDecision: 'DENY' }
]

for (const { requestedAgent, decision, auditDecision } of AC03_AUDIT_ROWS) {
  test(`AC-03: dispatch of ${requestedAgent} (${auditDecision}) writes exactly one DispatchEvaluated record`, async () => {
    const state = { currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] }
    const { result, entries } = await runGate({ reader: stateReaderReturning(state), requestedAgent })

    assert.equal(result.decision, decision)
    assert.equal(entries.length, 1)
    const audit = entries[0]
    assert.equal(audit.event, 'DispatchEvaluated')
    assert.equal(audit.requestedAgent, requestedAgent)
    assert.ok('expectedAgent' in audit, 'audit captures the expected agent')
    assert.equal(audit.decision, auditDecision)
  })
}

// ───────────────────────────────────────────────────────────────────────────
// AC-04 — Fail-closed when state cannot be read (never allow)
// ───────────────────────────────────────────────────────────────────────────

const enoent = Object.assign(new Error("ENOENT: no such file or directory, open 'state.json'"), { code: 'ENOENT' })
const parseError = new SyntaxError('Unexpected end of JSON input')

const AC04_CASES = [
  {
    label: 'missing / unreadable state file',
    reader: stateReaderThrowing(enoent),
    code: 'UNREADABLE_STATE'
  },
  {
    label: 'truncated / unparseable state',
    reader: stateReaderThrowing(parseError),
    code: 'UNREADABLE_STATE'
  },
  {
    label: 'present but schema-invalid state',
    reader: stateReaderReturning({ currentPhase: 'DISCUSS', specialistDone: true, reviewerVerdict: 'MAYBE', retries: 0, skipPhases: [] }),
    code: 'INVALID_STATE'
  },
  {
    label: 'state recording a phase outside the published order',
    reader: stateReaderReturning({ currentPhase: 'NONEXISTENT', specialistDone: false, reviewerVerdict: null, retries: 0, skipPhases: [] }),
    code: 'INVALID_STATE'
  }
]

// ───────────────────────────────────────────────────────────────────────────
// AC-05 — The guard governs ONLY pipeline agents (active-pipeline-only)
// A worker or product-layer agent dispatched during an active pipeline is allowed;
// it is ungoverned by phase order. Fail-closed on missing/invalid state is unchanged.
// ───────────────────────────────────────────────────────────────────────────

test('AC-05: an ungoverned agent (worker) is allowed during an active pipeline and audited as UNGOVERNED', async () => {
  // Active DELIVER pipeline, specialist done, reviewer pending — a worker dispatch must pass.
  const state = { currentPhase: 'DELIVER', specialistDone: true, reviewerVerdict: null, retries: 0, skipPhases: [] }
  const { result, entries } = await runGate({ reader: stateReaderReturning(state), requestedAgent: 'contract-testing-worker' })

  assert.equal(result.decision, 'allow', 'a non-pipeline agent must not be denied for phase order')

  assert.equal(entries.length, 1)
  const audit = entries[0]
  assert.equal(audit.event, 'DispatchEvaluated')
  assert.equal(audit.requestedAgent, 'contract-testing-worker')
  assert.equal(audit.expectedAgent, null)
  assert.equal(audit.decision, 'ALLOW')
  assert.equal(audit.code, 'UNGOVERNED')
})

test('AC-05: an ungoverned agent with a missing state file still fails closed (safety unchanged)', async () => {
  const { result } = await runGate({ reader: stateReaderThrowing(enoent), requestedAgent: 'contract-testing-worker' })
  assert.equal(result.decision, 'block', 'missing state blocks regardless of the agent (AC-04 invariant holds)')
})
