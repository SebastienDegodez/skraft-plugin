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

const EAGER_CONFIG = {
  agentSkills: {
    'acceptance-designer': [
      { name: 'bdd-methodology', policy: 'eager' },
      { name: 'outside-in-tdd', policy: 'verify' }
    ],
    'skraft-orchestrator': []
  }
}

const FIXED_NOW = '2026-06-29T12:00:00.000Z'
const clock = { now: () => FIXED_NOW }

const nullSkillFileReader = { read: async () => { throw new Error('not found') } }
const nullAuditWriter = { write: async () => {} }

const collectingWriter = () => {
  const entries = []
  return { entries, write: async (e) => { entries.push(e) } }
}

// verify mode (default) ———————————————————————————————————————————————

test('returns additionalContext with mandatory skills directive in verify mode', async () => {
  const service = createSubagentStartService({ config: CONFIG, skillFileReader: nullSkillFileReader, auditWriter: nullAuditWriter, clock })
  const result = await service.handle({ agentName: 'acceptance-designer' })
  assert.equal(result.decision, 'additionalContext')
  assert.ok(result.context.includes('The following skills are MANDATORY:'))
  // Kills StringLiteral mutant: join(', ') → join('') — names must be comma-separated
  assert.ok(result.context.includes('bdd-methodology, outside-in-tdd'),
    `directive must list skills comma-separated; got: "${result.context}"`)
})

test('returns allow when agent has no mandatory skills', async () => {
  const service = createSubagentStartService({ config: CONFIG, skillFileReader: nullSkillFileReader, auditWriter: nullAuditWriter, clock })
  const result = await service.handle({ agentName: 'skraft-orchestrator' })
  assert.equal(result.decision, 'allow')
})

test('returns allow when agentName is unknown', async () => {
  const service = createSubagentStartService({ config: CONFIG, skillFileReader: nullSkillFileReader, auditWriter: nullAuditWriter, clock })
  const result = await service.handle({ agentName: 'unknown-agent' })
  assert.equal(result.decision, 'allow')
})

// eager mode (driven by policy field in config) ———————————————————————

test('eager mode inlines SKILL.md content alongside the directive', async () => {
  const skillFileReader = { read: async (name) => `content of ${name}` }
  const service = createSubagentStartService({ config: EAGER_CONFIG, skillFileReader, auditWriter: nullAuditWriter, clock })
  const result = await service.handle({ agentName: 'acceptance-designer' })
  assert.equal(result.decision, 'additionalContext')
  assert.ok(result.context.includes('The following skills are MANDATORY:'))
  assert.ok(result.context.includes('content of bdd-methodology'))
})

test('eager mode reads only skills with policy eager, not verify-policy skills', async () => {
  // Kills MethodExpression mutant: filter(isEagerSkill) → skillEntries (reads all skills eagerly)
  // Also kills ConditionalExpression mutant: isEagerSkill → true
  const readSkills = []
  const trackingReader = { read: async (name) => { readSkills.push(name); return `content-${name}` } }
  const service = createSubagentStartService({ config: EAGER_CONFIG, skillFileReader: trackingReader, auditWriter: nullAuditWriter, clock })
  await service.handle({ agentName: 'acceptance-designer' })
  // EAGER_CONFIG: bdd-methodology=eager, outside-in-tdd=verify → only bdd-methodology must be read
  assert.deepEqual(readSkills, ['bdd-methodology'],
    `only eager-policy skills must be read; skillFileReader was called for: ${JSON.stringify(readSkills)}`)
})

test('eager mode still returns directive when skill file is unreadable (fail-open)', async () => {
  const audit = collectingWriter()
  const service = createSubagentStartService({ config: EAGER_CONFIG, skillFileReader: nullSkillFileReader, auditWriter: audit, clock })
  const result = await service.handle({ agentName: 'acceptance-designer' })
  assert.equal(result.decision, 'additionalContext')
  assert.ok(result.context.includes('The following skills are MANDATORY:'))
  assert.ok(audit.entries.some((e) => e.eventType === 'EagerReadFailed'), 'EagerReadFailed audit entry must be written')
})

// edge cases ——————————————————————————————————————————————————————————

test('handle called with no arguments returns allow (no agentName → no skills)', async () => {
  const service = createSubagentStartService({ config: CONFIG, skillFileReader: nullSkillFileReader, auditWriter: nullAuditWriter, clock })
  const result = await service.handle()
  assert.equal(result.decision, 'allow')
})
