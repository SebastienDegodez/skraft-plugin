import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPostToolUseService } from '../../../plugins/skraft-framework/src/application/post-tool-use-service.mjs'

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
  const result = await service.handle({ agentName: 'solution-architect', toolInput: { path: 'plugins/skraft-framework/skills/bdd-methodology/SKILL.md' } })
  assert.equal(result?.decision, 'allow')
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].eventType, 'SkillRead')
  assert.equal(audit.entries[0].agentName, 'solution-architect')
  assert.equal(audit.entries[0].skillName, 'bdd-methodology')
  assert.equal(audit.entries[0].path, 'plugins/skraft-framework/skills/bdd-methodology/SKILL.md')
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
  const result = await service.handle({ agentName: 'test', toolInput: { path: 'plugins/skraft-framework/skills/foo/SKILL.md.bak' } })
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
  const result = await service.handle({ agentName: 'test', toolInput: { path: 'plugins/skraft-framework/skills/bdd-methodology/SKILL.md' } })
  assert.equal(result?.decision, 'allow')
})

test('returns allow (fail-open) when clock throws', async () => {
  const throwingClock = { now: () => { throw new Error('clock error') } }
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock: throwingClock })
  const result = await service.handle({ agentName: 'test', toolInput: { path: 'plugins/skraft-framework/skills/bdd-methodology/SKILL.md' } })
  assert.equal(result?.decision, 'allow')
})

test('handle with no arguments returns allow without throwing', async () => {
  const service = createPostToolUseService({ auditWriter: collectingWriter(), clock })
  const result = await service.handle()
  assert.equal(result?.decision, 'allow')
})


// G6 orchestrator continuation on PostToolUse(Agent) ————————————————————

const PIPELINE_CONFIG = {
  phaseOrder: ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'],
  phaseAgents: {
    RESEARCH: { specialist: 'solution-researcher', reviewer: null },
    DESIGN: { specialist: 'solution-architect', reviewer: 'solution-architect-reviewer' },
    DISTILL: { specialist: 'acceptance-designer', reviewer: 'acceptance-designer-reviewer' },
    DELIVER: { specialist: 'software-engineer', reviewer: 'software-engineer-reviewer' }
  }
}

// The state.json shape the state CLI writes.
const pipelineState = (currentPhase, overrides = {}) => ({
  currentPhase, phasesCompleted: [], phaseArtifacts: {}, verdicts: {}, retryCount: {},
  userPreferences: { maxRetriesPerPhase: 2 }, ...overrides
})
const stateReaderReturning = (state) => ({ read: async () => state })

// The returning sub-agent is the tool's subagent_type; agentName is the hook's caller.
const agentReturned = (subagentType) => ({
  toolName: 'Agent', agentName: 'skraft-orchestrator', projectSlug: 'my-project', toolInput: { subagentType }
})

test('G6: a returning specialist is told to record its artefacts and dispatch its reviewer', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader: stateReaderReturning(pipelineState('DESIGN')), config: PIPELINE_CONFIG })
  const result = await service.handle(agentReturned('solution-architect'))
  assert.equal(result?.decision, 'additionalContext')
  assert.match(result.context, /record-artifact --phase DESIGN/)
  assert.match(result.context, /dispatch solution-architect-reviewer/)
  assert.deepEqual(audit.entries, [{ eventType: 'ContinuationInjected', agentName: 'solution-architect', phase: 'DESIGN', kind: 'REVIEW', timestamp: FIXED_NOW }])
})

test('G6: a returning reviewer is told how to record its verdict, escalating once the budget is spent', async () => {
  const audit = collectingWriter()
  const exhausted = pipelineState('DESIGN', { retryCount: { DESIGN: 2 } })
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader: stateReaderReturning(exhausted), config: PIPELINE_CONFIG })
  const result = await service.handle({ ...agentReturned(undefined), requestedAgent: 'solution-architect-reviewer' })
  assert.match(result.context, /record-verdict --verdict APPROVED/)
  assert.match(result.context, /escalate to the user/)
  assert.equal(audit.entries[0].kind, 'VERDICT')
})

test('G6: nothing is injected for a worker, a lens or an agent of another phase', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader: stateReaderReturning(pipelineState('DELIVER')), config: PIPELINE_CONFIG })
  for (const agent of ['contract-testing-worker', 'cold-reader-lens', 'solution-architect']) {
    assert.equal((await service.handle(agentReturned(agent)))?.decision, 'allow', agent)
  }
  assert.equal(audit.entries.length, 0)
})

test('G6: allows without context when the state is invalid (fail-open)', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader: stateReaderReturning({ currentPhase: 42 }), config: PIPELINE_CONFIG })
  const result = await service.handle(agentReturned('solution-architect'))
  assert.equal(result?.decision, 'allow')
  assert.equal(audit.entries.length, 0)
})

test('G6: allows without any read when stateReader is not wired', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock, config: PIPELINE_CONFIG })
  const result = await service.handle(agentReturned('solution-architect'))
  assert.equal(result?.decision, 'allow')
  assert.equal(audit.entries.length, 0)
})

test('G6: allows when projectSlug is absent', async () => {
  const audit = collectingWriter()
  let read = false
  const stateReader = { read: async () => { read = true; return {} } }
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle({ toolName: 'Agent', toolInput: { subagentType: 'solution-architect' } })
  assert.equal(result?.decision, 'allow')
  assert.equal(read, false)
})

test('G6: fail-open allow when stateReader throws', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => { throw new Error('state unreadable') } }
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader, config: PIPELINE_CONFIG })
  const result = await service.handle(agentReturned('solution-architect'))
  assert.equal(result?.decision, 'allow')
})

test('G6: an Agent post-tool-use never runs the G3 skill tracer', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader: stateReaderReturning(pipelineState('DESIGN')), config: PIPELINE_CONFIG })
  await service.handle({ ...agentReturned('solution-architect'), toolInput: { subagentType: 'solution-architect', path: 'plugins/skraft-framework/skills/bdd-methodology/SKILL.md' } })
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].eventType, 'ContinuationInjected')
})

test('G6: continuation still injects when the audit write fails', async () => {
  const throwingWriter = { write: async () => { throw new Error('disk full') } }
  const service = createPostToolUseService({ auditWriter: throwingWriter, clock, stateReader: stateReaderReturning(pipelineState('DESIGN')), config: PIPELINE_CONFIG })
  const result = await service.handle(agentReturned('solution-architect'))
  assert.equal(result?.decision, 'additionalContext')
})

test('G6: fail-open allow when config is not wired', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock, stateReader: stateReaderReturning(pipelineState('DESIGN')) })
  const result = await service.handle(agentReturned('solution-architect'))
  assert.equal(result?.decision, 'allow')
})
