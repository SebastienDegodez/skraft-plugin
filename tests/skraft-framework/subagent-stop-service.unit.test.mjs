import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentStopService } from '../../plugins/src/application/subagent-stop-service.mjs'

const CONFIG = {
  agentSkills: {
    'acceptance-designer': [
      { name: 'bdd-methodology', policy: 'verify' },
      { name: 'outside-in-tdd', policy: 'verify' }
    ],
    'skraft-orchestrator': []
  }
}

const FIXED_NOW = '2026-06-29T12:00:00.000Z'
const clock = { now: () => FIXED_NOW }

const collectingWriter = () => {
  const entries = []
  return { entries, write: async (e) => { entries.push(e) } }
}

// happy path — all skills present ————————————————————————————————————

test('allows when all mandatory skills were read', async () => {
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, auditWriter: audit, clock })
  const transcript = 'read bdd-methodology/SKILL.md and outside-in-tdd/SKILL.md'
  const result = await service.handle({ agentName: 'acceptance-designer', transcript })
  assert.equal(result.decision, 'allow')
  assert.equal(audit.entries[0].decision, 'ALLOW')
  assert.deepEqual(audit.entries[0].missing, [])
})

// block path — missing skills ————————————————————————————————————————

test('blocks when a mandatory skill was not read', async () => {
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, auditWriter: audit, clock })
  const result = await service.handle({
    agentName: 'acceptance-designer',
    transcript: 'read bdd-methodology/SKILL.md only'
  })
  assert.equal(result.decision, 'block')
  assert.ok(result.message.includes('outside-in-tdd'))
})

test('block message lists all missing skills', async () => {
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, auditWriter: audit, clock })
  const result = await service.handle({ agentName: 'acceptance-designer', transcript: '' })
  assert.ok(result.message.includes('bdd-methodology'))
  assert.ok(result.message.includes('outside-in-tdd'))
})

// no-skill agent — always allow ———————————————————————————————————————

test('allows when agent has no mandatory skills', async () => {
  const service = createSubagentStopService({ config: CONFIG, auditWriter: collectingWriter(), clock })
  const result = await service.handle({ agentName: 'skraft-orchestrator', transcript: '' })
  assert.equal(result.decision, 'allow')
})

// audit contents ——————————————————————————————————————————————————————

test('writes SkillGuardEvaluated audit entry', async () => {
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, auditWriter: audit, clock })
  await service.handle({ agentName: 'acceptance-designer', transcript: 'bdd-methodology/SKILL.md' })
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].event, 'SkillGuardEvaluated')
  assert.equal(audit.entries[0].agentName, 'acceptance-designer')
  assert.equal(audit.entries[0].evaluatedAt, FIXED_NOW)
})

// fail-open on unexpected errors ——————————————————————————————————————

test('allows (fail-open) when auditWriter throws', async () => {
  const throwingWriter = { write: async () => { throw new Error('disk full') } }
  const service = createSubagentStopService({ config: CONFIG, auditWriter: throwingWriter, clock })
  const result = await service.handle({ agentName: 'acceptance-designer', transcript: '' })
  assert.equal(result.decision, 'allow')
})

test('allows (fail-open) when clock throws', async () => {
  const throwingClock = { now: () => { throw new Error('clock error') } }
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, auditWriter: audit, clock: throwingClock })
  const result = await service.handle({ agentName: 'acceptance-designer', transcript: '' })
  assert.equal(result.decision, 'allow')
})

// array transcript ————————————————————————————————————————————————————

test('extracts skills from array transcript', async () => {
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, auditWriter: audit, clock })
  const transcript = [{ text: 'bdd-methodology/SKILL.md' }, { text: 'outside-in-tdd/SKILL.md' }]
  const result = await service.handle({ agentName: 'acceptance-designer', transcript })
  assert.equal(result.decision, 'allow')
})
