/**
 * Outer-loop acceptance tests — US4 / G2+G3 Skill-Loading Guardrail (#50)
 *
 * These tests encode the CONTRACT values verbatim (domain examples 1–8).
 * They MUST fail RED until the DELIVER phase makes them GREEN.
 * IRON RULE: never modify input values or assertions to make tests pass — fix the implementation.
 *
 * Entry points under test (application boundary, boundary-to-boundary):
 *   createSubagentStartService  — AC-01, AC-03
 *   createSubagentStopService   — AC-02
 *   createPostToolUseService    — AC-04
 *
 * Test doubles: in-memory only (Strategy A — no real I/O, no filesystem, no audit file).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSubagentStartService } from '../../plugins/src/application/subagent-start-service.mjs'
import { createSubagentStopService }  from '../../plugins/src/application/subagent-stop-service.mjs'
import { createPostToolUseService }   from '../../plugins/src/application/post-tool-use-service.mjs'

// ── Published Language config (domain examples — verbatim from stories-2026-06-29.md §Domain Examples)
const CONFIG = {
  agentSkills: {
    // domain examples 1, 2, 7
    'backlog-planner': [
      { name: 'issue-refinement', policy: 'verify' },
      { name: 'sprint-planning',  policy: 'verify' }
    ],
    // domain examples 3
    'solution-architect': [
      { name: 'architecture-decisions', policy: 'verify' },
      { name: 'architecture-patterns',  policy: 'verify' }
    ],
    // domain example 4 — bdd-methodology is EAGER
    'acceptance-designer': [
      { name: 'bdd-methodology',    policy: 'eager'  },
      { name: 'test-design-mandates', policy: 'verify' },
      { name: 'outside-in-tdd',    policy: 'verify' }
    ],
    'software-engineer': [
      { name: 'outside-in-tdd', policy: 'verify' }
    ],
    'skraft-orchestrator': []
  }
}

// ── Fixed clock (all audit timestamps deterministic)
const FIXED_NOW = '2026-06-30T00:00:00.000Z'
const fixedClock = { now: () => FIXED_NOW }

// ── In-memory test doubles
const collectingAuditWriter = () => {
  const entries = []
  return { entries, write: async (entry) => { entries.push(entry) } }
}

const throwingAuditWriter = () => ({
  write: async () => { throw new Error('disk full') }
})

// skillFileReader that returns deterministic content (domain example 4)
const EAGER_SKILL_CONTENT = '# BDD Methodology\n\nThe canonical skill content.'
const stubSkillFileReader = (content = EAGER_SKILL_CONTENT) => ({
  read: async (skillName) => {
    if (skillName === 'bdd-methodology') return content
    throw new Error(`skill file not found: ${skillName}`)
  }
})

const failingSkillFileReader = () => ({
  read: async () => { throw new Error('file not found') }
})

// transcriptReaderFactory (Contract 4 / DD-1 per-invocation factory pattern)
const transcriptReaderFactory = ({ transcript }) => ({
  read: async () => {
    if (!Array.isArray(transcript) || transcript.length === 0) {
      throw new Error('TRANSCRIPT_UNAVAILABLE')
    }
    return JSON.stringify(transcript)
  }
})

// Transcript helpers — build minimal arrays that contain the right SKILL.md path strings
const transcriptWith = (...skillNames) =>
  skillNames.map((name) => ({
    role: 'tool_result',
    content: `plugins/skills/${name}/SKILL.md`
  }))

// ─────────────────────────────────────────────────────────────────────────────
// AC-01 — SubagentStart: directive naming mandatory skills (domain example 1)
// ─────────────────────────────────────────────────────────────────────────────

test('AC-01 — backlog-planner receives a directive naming every mandatory skill at session start', async () => {
  // Domain example 1: backlog-planner → "The following skills are MANDATORY: issue-refinement, sprint-planning."
  const audit = collectingAuditWriter()
  const service = createSubagentStartService({
    config: CONFIG,
    skillFileReader: stubSkillFileReader(),
    auditWriter: audit,
    clock: fixedClock
  })

  const result = await service.handle({ agentName: 'backlog-planner' })

  // AC-01 observable outcome: additionalContext with the contract-specified directive text
  assert.equal(result.decision, 'additionalContext',
    'SubagentStart must return additionalContext, not allow or block')
  assert.ok(
    result.context.includes('The following skills are MANDATORY:'),
    `directive must use the contract phrase "The following skills are MANDATORY:"; got: ${result.context}`
  )
  assert.ok(result.context.includes('issue-refinement'),
    'directive must name skill issue-refinement')
  assert.ok(result.context.includes('sprint-planning'),
    'directive must name skill sprint-planning')
})

test('AC-01 — agent with no mandatory skills declared receives allow at session start', async () => {
  const service = createSubagentStartService({
    config: CONFIG,
    skillFileReader: stubSkillFileReader(),
    auditWriter: collectingAuditWriter(),
    clock: fixedClock
  })

  const result = await service.handle({ agentName: 'skraft-orchestrator' })

  assert.equal(result.decision, 'allow',
    'agent with no declared skills must receive allow, not additionalContext')
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-03 — SubagentStart: eager mode inlines SKILL.md content (domain example 4)
// ─────────────────────────────────────────────────────────────────────────────

test('AC-03 — acceptance-designer receives inlined bdd-methodology SKILL.md content at session start', async () => {
  // Domain example 4: acceptance-designer; bdd-methodology policy 'eager' → SKILL.md content inlined
  const audit = collectingAuditWriter()
  const service = createSubagentStartService({
    config: CONFIG,
    skillFileReader: stubSkillFileReader(EAGER_SKILL_CONTENT),
    auditWriter: audit,
    clock: fixedClock
  })

  // No mode arg: eager must be driven by the policy field in config, not a handle() argument
  const result = await service.handle({ agentName: 'acceptance-designer' })

  assert.equal(result.decision, 'additionalContext',
    'eager mode must still return additionalContext')
  assert.ok(
    result.context.includes(EAGER_SKILL_CONTENT),
    `context must include the inlined SKILL.md content for bdd-methodology; got: ${result.context.slice(0, 200)}`
  )
  // Mandatory directive must ALSO be present (AC-03: eager does not replace the directive)
  assert.ok(
    result.context.includes('The following skills are MANDATORY:'),
    'eager mode must include the mandatory directive alongside the inlined content'
  )
})

test('AC-03 — eager fail-open: unreadable SKILL.md returns directive-only additionalContext and records EagerReadFailed warning', async () => {
  // ADR-006: failing to read the eager skill file must not block the agent
  const audit = collectingAuditWriter()
  const service = createSubagentStartService({
    config: CONFIG,
    skillFileReader: failingSkillFileReader(),
    auditWriter: audit,
    clock: fixedClock
  })

  const result = await service.handle({ agentName: 'acceptance-designer' })

  assert.equal(result.decision, 'additionalContext',
    'eager fail-open must still return additionalContext')
  assert.ok(
    result.context.includes('The following skills are MANDATORY:'),
    'directive must be present even when eager read fails'
  )

  // EagerReadFailed WARN audit entry must be written (Contract 3 / ADR-006)
  assert.ok(audit.entries.length >= 1, 'at least one EagerReadFailed audit entry must be written')
  const warnEntry = audit.entries.find((e) => e.eventType === 'EagerReadFailed')
  assert.ok(warnEntry, `EagerReadFailed audit entry not found; entries: ${JSON.stringify(audit.entries)}`)
  assert.equal(warnEntry.agentName, 'acceptance-designer')
  assert.equal(warnEntry.skillName, 'bdd-methodology')
  assert.equal(warnEntry.decision, 'WARN')
  assert.equal(warnEntry.timestamp, FIXED_NOW)
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-02 — SubagentStop: block when mandatory skill missing (domain example 2)
// ─────────────────────────────────────────────────────────────────────────────

test('AC-02 — backlog-planner blocked when issue-refinement was never read', async () => {
  // Domain example 2: transcript has sprint-planning, NOT issue-refinement → block first missing
  const audit = collectingAuditWriter()
  const service = createSubagentStopService({
    config: CONFIG,
    transcriptReaderFactory,
    auditWriter: audit,
    clock: fixedClock
  })
  // Transcript contains sprint-planning but NOT issue-refinement
  const transcript = transcriptWith('sprint-planning')

  const result = await service.handle({ agentName: 'backlog-planner', transcript })

  // AC-02 observable outcome: block with the contract-specified message (first missing skill only)
  assert.equal(result.decision, 'block',
    'service must block when a mandatory skill is missing from the transcript')
  assert.equal(
    result.message,
    'Mandatory skill not loaded: issue-refinement',
    `block message must match contract; got: "${result.message}"`
  )

  // Audit entry must record the block decision (AC-02: "block decision is recorded in audit log")
  assert.equal(audit.entries.length, 1, 'exactly one compliance audit entry')
  const entry = audit.entries[0]
  assert.equal(entry.eventType, 'SkillComplianceChecked',
    `audit eventType must be SkillComplianceChecked; got: ${entry.eventType}`)
  assert.equal(entry.agentName, 'backlog-planner')
  assert.equal(entry.decision, 'BLOCK')
  assert.ok(
    Array.isArray(entry.missingSkills) && entry.missingSkills.includes('issue-refinement'),
    `audit entry must record missing skills; got: ${JSON.stringify(entry.missingSkills)}`
  )
  assert.equal(entry.timestamp, FIXED_NOW)
})

test('AC-02 — solution-architect allowed when all mandatory skills were read', async () => {
  // Domain example 3: all skills present → allow
  const audit = collectingAuditWriter()
  const service = createSubagentStopService({
    config: CONFIG,
    transcriptReaderFactory,
    auditWriter: audit,
    clock: fixedClock
  })
  const transcript = transcriptWith('architecture-decisions', 'architecture-patterns')

  const result = await service.handle({ agentName: 'solution-architect', transcript })

  assert.equal(result.decision, 'allow')
  assert.equal(audit.entries.length, 1)
  const entry = audit.entries[0]
  assert.equal(entry.eventType, 'SkillComplianceChecked')
  assert.equal(entry.agentName, 'solution-architect')
  assert.equal(entry.decision, 'ALLOW')
  assert.deepEqual(entry.missingSkills, [])
  assert.equal(entry.reason, 'all_present')
  assert.equal(entry.timestamp, FIXED_NOW)
})

test('AC-02 — backlog-planner allowed when transcript is absent (fail-open, ADR-006)', async () => {
  // Domain example 7: transcript absent → WARN audit + allow
  const audit = collectingAuditWriter()
  const service = createSubagentStopService({
    config: CONFIG,
    transcriptReaderFactory,
    auditWriter: audit,
    clock: fixedClock
  })

  const result = await service.handle({ agentName: 'backlog-planner', transcript: undefined })

  // ADR-006: transcript unavailable is a monitoring failure, not a compliance signal → allow
  assert.equal(result.decision, 'allow',
    'transcript unavailable must result in allow (fail-open), not block')

  // Audit entry must record the reason (observability)
  assert.equal(audit.entries.length, 1, 'one audit entry even on fail-open path')
  const entry = audit.entries[0]
  assert.equal(entry.eventType, 'SkillComplianceChecked')
  assert.equal(entry.reason, 'transcript_unavailable',
    `reason must be transcript_unavailable; got: ${entry.reason}`)
  assert.equal(entry.decision, 'ALLOW')
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-04 — PostToolUse Read: SkillRead audit entry (domain example 5)
// ─────────────────────────────────────────────────────────────────────────────

test('AC-04 — solution-architect reading architecture-decisions/SKILL.md produces a SkillRead audit entry', async () => {
  // Domain example 5: SkillRead entry with agentName, skillName, path, timestamp
  const audit = collectingAuditWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock: fixedClock })

  const SKILL_PATH = 'plugins/skills/architecture-decisions/SKILL.md'
  const result = await service.handle({
    agentName: 'solution-architect',
    toolInput: { path: SKILL_PATH }
  })

  // AC-04 observable outcome: allow + SkillRead entry in audit log
  assert.equal(result?.decision, 'allow',
    `PostToolUse Read must return allow; got: ${JSON.stringify(result)}`)
  assert.equal(audit.entries.length, 1, 'exactly one SkillRead audit entry')

  const entry = audit.entries[0]
  assert.equal(entry.eventType, 'SkillRead',
    `eventType must be 'SkillRead'; got: '${entry.eventType}'`)
  assert.equal(entry.agentName, 'solution-architect',
    `agentName must be 'solution-architect'; got: '${entry.agentName}'`)
  assert.equal(entry.skillName, 'architecture-decisions',
    `skillName must be 'architecture-decisions'; got: '${entry.skillName}'`)
  assert.equal(entry.path, SKILL_PATH,
    `path must match the read path; got: '${entry.path}'`)
  assert.equal(entry.timestamp, FIXED_NOW,
    `timestamp must be clock output; got: '${entry.timestamp}'`)
})

test('AC-04 — audit write failure does not block the agent (fail-open, ADR-006; domain example 6)', async () => {
  // Domain example 6: I/O error on audit write → allow; agent not blocked
  const service = createPostToolUseService({ auditWriter: throwingAuditWriter(), clock: fixedClock })

  const result = await service.handle({
    agentName: 'solution-architect',
    toolInput: { path: 'plugins/skills/architecture-decisions/SKILL.md' }
  })

  assert.equal(result?.decision, 'allow',
    `fail-open must return allow even when audit write throws; got: ${JSON.stringify(result)}`)
})

test('AC-04 — reading a non-skill file produces no audit entry and returns allow immediately (domain example 8)', async () => {
  // Domain example 8: path does not match /SKILL.md → skip, no audit, allow
  const audit = collectingAuditWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock: fixedClock })

  const result = await service.handle({
    agentName: 'software-engineer',
    toolInput: { path: 'src/application/pre-tool-use-service.mjs' }
  })

  assert.equal(result?.decision, 'allow',
    `non-skill read must return allow; got: ${JSON.stringify(result)}`)
  assert.equal(audit.entries.length, 0,
    'no audit entry must be written for a non-SKILL.md read')
})
