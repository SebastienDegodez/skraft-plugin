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

