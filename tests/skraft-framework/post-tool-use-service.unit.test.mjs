import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPostToolUseService } from '../../plugins/src/application/post-tool-use-service.mjs'

const FIXED_NOW = '2026-06-29T12:00:00.000Z'
const clock = { now: () => FIXED_NOW }

const collectingWriter = () => {
  const entries = []
  return { entries, write: async (e) => { entries.push(e) } }
}

// SKILL.md reads are logged ———————————————————————————————————————————

test('writes SkillRead audit entry for a SKILL.md path', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock })
  const result = await service.handle({ agentName: 'solution-architect', toolInput: { path: 'plugins/skills/bdd-methodology/SKILL.md' } })
  assert.equal(result?.decision, 'allow')
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].eventType, 'SkillRead')
  assert.equal(audit.entries[0].agentName, 'solution-architect')
  assert.equal(audit.entries[0].skillName, 'bdd-methodology')
  assert.equal(audit.entries[0].path, 'plugins/skills/bdd-methodology/SKILL.md')
  assert.equal(audit.entries[0].timestamp, FIXED_NOW)
})

test('extracts skill name from .agents/skills prefix', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock })
  await service.handle({ agentName: 'test', toolInput: { path: '.agents/skills/outside-in-tdd/SKILL.md' } })
  assert.equal(audit.entries[0].skillName, 'outside-in-tdd')
})

test('extracts skill name from .github/skills prefix', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock })
  await service.handle({ agentName: 'test', toolInput: { path: '.github/skills/my-skill/SKILL.md' } })
  assert.equal(audit.entries[0].skillName, 'my-skill')
})

// non-SKILL.md reads are ignored ——————————————————————————————————————

test('returns allow without writing for a non-SKILL.md path', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock })
  const result = await service.handle({ agentName: 'test', toolInput: { path: 'src/app.mjs' } })
  assert.equal(audit.entries.length, 0)
  assert.equal(result?.decision, 'allow')
})

test('returns allow without writing when path ends in SKILL.md but has trailing extension ($ anchor guard)', async () => {
  // Kills the Regex survivor: removing $ anchor would match 'SKILL.md.bak', which must NOT produce audit
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock })
  const result = await service.handle({ agentName: 'test', toolInput: { path: 'plugins/skills/foo/SKILL.md.bak' } })
  assert.equal(audit.entries.length, 0, 'path with extension after SKILL.md must produce no audit entry')
  assert.equal(result?.decision, 'allow')
})

test('returns allow without writing when path is absent', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock })
  const result = await service.handle({ agentName: 'test', toolInput: { command: 'ls' } })
  assert.equal(audit.entries.length, 0)
  assert.equal(result?.decision, 'allow')
})

// fail-open ———————————————————————————————————————————————————————————

test('returns allow (fail-open) when auditWriter throws', async () => {
  const throwingWriter = { write: async () => { throw new Error('disk full') } }
  const service = createPostToolUseService({ auditWriter: throwingWriter, clock })
  const result = await service.handle({ agentName: 'test', toolInput: { path: 'plugins/skills/bdd-methodology/SKILL.md' } })
  assert.equal(result?.decision, 'allow')
})

test('returns allow (fail-open) when clock throws', async () => {
  const throwingClock = { now: () => { throw new Error('clock error') } }
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock: throwingClock })
  const result = await service.handle({ agentName: 'test', toolInput: { path: 'plugins/skills/bdd-methodology/SKILL.md' } })
  assert.equal(result?.decision, 'allow')
})

test('handle with no arguments returns allow without throwing', async () => {
  const service = createPostToolUseService({ auditWriter: collectingWriter(), clock })
  const result = await service.handle()
  assert.equal(result?.decision, 'allow')
})


// G6 orchestrator continuation on PostToolUse(Agent) ————————————————————

const PIPELINE_CONFIG = {
  phaseOrder: ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL', 'DELIVER'],
  retryBudget: 3,
  phaseAgents: {
    DISCOVER: { specialist: 'backlog-discoverer', reviewer: 'backlog-discoverer-reviewer' },
    DISCUSS: { specialist: 'backlog-planner', reviewer: 'backlog-planner-reviewer' },
    DESIGN: { specialist: 'solution-architect', reviewer: 'solution-architect-reviewer' },
    DISTILL: { specialist: 'acceptance-designer', reviewer: 'acceptance-designer-reviewer' },
    DELIVER: { specialist: 'software-engineer', reviewer: 'software-engineer-reviewer' }
  }
}

const stateReaderReturning = (state) => ({ read: async () => state })

test('G6: injects next-step continuation after a successful sub-agent (ADVANCE)', async () => {
  const audit = collectingWriter()
  const stateReader = stateReaderReturning({ currentPhase: 'DISCOVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] })
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', agentName: 'backlog-discoverer-reviewer', projectSlug: 'my-project' })
  assert.equal(result?.decision, 'additionalContext')
  assert.match(result.context, /next step/i)
  assert.match(result.context, /backlog-planner/)
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].eventType, 'ContinuationInjected')
  assert.equal(audit.entries[0].kind, 'NEXT_STEP')
  assert.equal(audit.entries[0].stage, 'ADVANCE')
  assert.equal(audit.entries[0].expectedAgent, 'backlog-planner')
  assert.equal(audit.entries[0].timestamp, FIXED_NOW)
})

test('G6: injects re-dispatch continuation after a rejected sub-agent (CHANGES_REQUESTED)', async () => {
  const audit = collectingWriter()
  const stateReader = stateReaderReturning({ currentPhase: 'DESIGN', specialistDone: true, reviewerVerdict: 'CHANGES_REQUESTED', retries: 0, skipPhases: [] })
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', agentName: 'solution-architect-reviewer', projectSlug: 'my-project' })
  assert.equal(result?.decision, 'additionalContext')
  assert.match(result.context, /requested changes/i)
  assert.match(result.context, /re-dispatch/i)
  assert.match(result.context, /solution-architect/)
  assert.match(result.context, /gaps/i)
  assert.equal(audit.entries[0].eventType, 'ContinuationInjected')
  assert.equal(audit.entries[0].kind, 'REDISPATCH')
  assert.equal(audit.entries[0].stage, 'RETRY')
})

test('G6: injects escalation continuation when retry budget is exhausted', async () => {
  const audit = collectingWriter()
  const stateReader = stateReaderReturning({ currentPhase: 'DESIGN', specialistDone: true, reviewerVerdict: 'CHANGES_REQUESTED', retries: 3, skipPhases: [] })
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', agentName: 'solution-architect-reviewer', projectSlug: 'my-project' })
  assert.equal(result?.decision, 'additionalContext')
  assert.match(result.context, /escalate/i)
  assert.equal(audit.entries[0].eventType, 'ContinuationInjected')
  assert.equal(audit.entries[0].kind, 'ESCALATE')
})

test('G6: injects completion continuation after the final phase is approved', async () => {
  const audit = collectingWriter()
  const stateReader = stateReaderReturning({ currentPhase: 'DELIVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] })
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', agentName: 'software-engineer-reviewer', projectSlug: 'my-project' })
  assert.equal(result?.decision, 'additionalContext')
  assert.match(result.context, /completed/i)
  assert.equal(audit.entries[0].eventType, 'ContinuationInjected')
  assert.equal(audit.entries[0].kind, 'COMPLETE')
})

test('G6: injects the specialist next-step when the specialist has not run yet (SPECIALIST)', async () => {
  const audit = collectingWriter()
  const stateReader = stateReaderReturning({ currentPhase: 'DISCOVER', specialistDone: false, reviewerVerdict: null, retries: 0, skipPhases: [] })
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', agentName: 'skraft-orchestrator', projectSlug: 'my-project' })
  assert.equal(result?.decision, 'additionalContext')
  assert.match(result.context, /backlog-discoverer/)
  assert.equal(audit.entries[0].kind, 'NEXT_STEP')
  assert.equal(audit.entries[0].stage, 'SPECIALIST')
})

test('G6: allows without context (SKIPPED audit) when state cannot resolve a next agent', async () => {
  const audit = collectingWriter()
  // Valid runtime state but config has no such phase → expectedNextAgent Err INVALID_STATE.
  const stateReader = stateReaderReturning({ currentPhase: 'UNKNOWN', specialistDone: false, reviewerVerdict: null, retries: 0, skipPhases: [] })
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', agentName: 'x', projectSlug: 'my-project' })
  assert.equal(result?.decision, 'allow')
  assert.equal(audit.entries[0].eventType, 'ContinuationInjected')
  assert.equal(audit.entries[0].kind, 'SKIPPED')
})

test('G6: allows without reading when state is invalid (fail-open)', async () => {
  const audit = collectingWriter()
  const stateReader = stateReaderReturning({ currentPhase: 42 }) // fails validateState
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', agentName: 'x', projectSlug: 'my-project' })
  assert.equal(result?.decision, 'allow')
  assert.equal(audit.entries.length, 0)
})

test('G6: allows without any read when stateReader is not wired', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', agentName: 'x', projectSlug: 'my-project' })
  assert.equal(result?.decision, 'allow')
  assert.equal(audit.entries.length, 0)
})

test('G6: allows when projectSlug is absent', async () => {
  const audit = collectingWriter()
  let read = false
  const stateReader = { read: async () => { read = true; return {} } }
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', agentName: 'x' })
  assert.equal(result?.decision, 'allow')
  assert.equal(read, false)
})

test('G6: fail-open allow when stateReader throws', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => { throw new Error('state unreadable') } }
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', agentName: 'x', projectSlug: 'my-project' })
  assert.equal(result?.decision, 'allow')
})

test('G6: an Agent post-tool-use never runs the G3 skill tracer', async () => {
  const audit = collectingWriter()
  const stateReader = stateReaderReturning({ currentPhase: 'DISCOVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] })
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  await service.handle({ toolName: 'Agent', agentName: 'x', projectSlug: 'my-project', toolInput: { path: 'plugins/skills/bdd-methodology/SKILL.md' } })
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].eventType, 'ContinuationInjected')
})

test('G6: continuation still allows (never blocks) even when the audit write fails', async () => {
  const throwingWriter = { write: async () => { throw new Error('disk full') } }
  const stateReader = stateReaderReturning({ currentPhase: 'DISCOVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] })
  const service = createPostToolUseService({ auditWriter: throwingWriter, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', agentName: 'x', projectSlug: 'my-project' })
  assert.equal(result?.decision, 'additionalContext')
})

test('G6: fail-open allow when config is not wired (no phaseOrder to resolve)', async () => {
  const audit = collectingWriter()
  const stateReader = stateReaderReturning({ currentPhase: 'DISCOVER', specialistDone: true, reviewerVerdict: 'APPROVED', retries: 0, skipPhases: [] })
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader })
  const result = await service.handle({ toolName: 'Agent', agentName: 'x', projectSlug: 'my-project' })
  assert.equal(result?.decision, 'allow')
})
