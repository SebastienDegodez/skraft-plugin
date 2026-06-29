import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentStartService } from '../../plugins/src/application/subagent-start-service.mjs'

const CONFIG = {
  agentSkills: {
    'acceptance-designer': [
      { name: 'bdd-methodology', policy: 'verify' },
      { name: 'outside-in-tdd', policy: 'verify' }
    ],
    'skraft-orchestrator': []
  }
}

const nullFilesystem = { readFile: async () => { throw new Error('not found') } }

// verify mode (default) ———————————————————————————————————————————————

test('returns additionalContext with MANDATORY SKILLS directive in verify mode', async () => {
  const service = createSubagentStartService({ config: CONFIG, filesystem: nullFilesystem })
  const result = await service.handle({ agentName: 'acceptance-designer' })
  assert.equal(result.decision, 'additionalContext')
  assert.ok(result.context.includes('MANDATORY SKILLS'))
  assert.ok(result.context.includes('bdd-methodology/SKILL.md'))
  assert.ok(result.context.includes('outside-in-tdd/SKILL.md'))
})

test('returns allow when agent has no mandatory skills', async () => {
  const service = createSubagentStartService({ config: CONFIG, filesystem: nullFilesystem })
  const result = await service.handle({ agentName: 'skraft-orchestrator' })
  assert.equal(result.decision, 'allow')
})

test('returns allow when agentName is unknown', async () => {
  const service = createSubagentStartService({ config: CONFIG, filesystem: nullFilesystem })
  const result = await service.handle({ agentName: 'unknown-agent' })
  assert.equal(result.decision, 'allow')
})

test('explicit verify mode returns the directive', async () => {
  const service = createSubagentStartService({ config: CONFIG, filesystem: nullFilesystem })
  const result = await service.handle({ agentName: 'acceptance-designer', mode: 'verify' })
  assert.equal(result.decision, 'additionalContext')
  assert.ok(result.context.includes('MANDATORY SKILLS'))
})

// eager mode ——————————————————————————————————————————————————————————

test('eager mode inlines SKILL.md content alongside the directive', async () => {
  const fs = { readFile: async (path) => `content of ${path}` }
  const service = createSubagentStartService({ config: CONFIG, filesystem: fs })
  const result = await service.handle({ agentName: 'acceptance-designer', mode: 'eager' })
  assert.equal(result.decision, 'additionalContext')
  assert.ok(result.context.includes('MANDATORY SKILLS'))
  assert.ok(result.context.includes('content of plugins/skills/bdd-methodology/SKILL.md'))
})

test('eager mode still returns directive when filesystem is unavailable', async () => {
  const service = createSubagentStartService({ config: CONFIG, filesystem: nullFilesystem })
  const result = await service.handle({ agentName: 'acceptance-designer', mode: 'eager' })
  assert.equal(result.decision, 'additionalContext')
  assert.ok(result.context.includes('MANDATORY SKILLS'))
})

// edge cases ——————————————————————————————————————————————————————————

test('handle called with no arguments returns allow (no agentName → no skills)', async () => {
  const service = createSubagentStartService({ config: CONFIG, filesystem: nullFilesystem })
  const result = await service.handle()
  assert.equal(result.decision, 'allow')
})
