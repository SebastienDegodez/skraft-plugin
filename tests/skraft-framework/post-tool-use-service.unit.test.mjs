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

test('writes SkillRead audit entry for a Read tool on a SKILL.md path', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock })
  await service.handle({ toolName: 'Read', toolInput: { filePath: 'plugins/skills/bdd-methodology/SKILL.md' } })
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].event, 'SkillRead')
  assert.equal(audit.entries[0].skill, 'bdd-methodology')
  assert.equal(audit.entries[0].readAt, FIXED_NOW)
})

test('extracts skill name from nested custom path', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock })
  await service.handle({ toolName: 'Read', toolInput: { filePath: 'custom/outside-in-tdd/SKILL.md' } })
  assert.equal(audit.entries[0].skill, 'outside-in-tdd')
})

test('accepts snake_case file_path key from unnormalised payload', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock })
  await service.handle({ toolName: 'Read', toolInput: { file_path: 'custom/my-skill/SKILL.md' } })
  assert.equal(audit.entries[0].skill, 'my-skill')
})

// non-SKILL.md reads are ignored ——————————————————————————————————————

test('returns undefined without writing for a non-SKILL.md Read', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock })
  const result = await service.handle({ toolName: 'Read', toolInput: { filePath: 'src/app.mjs' } })
  assert.equal(audit.entries.length, 0)
  assert.equal(result, undefined)
})

test('returns undefined without writing for a non-Read tool', async () => {
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock })
  const result = await service.handle({ toolName: 'Bash', toolInput: { command: 'ls' } })
  assert.equal(audit.entries.length, 0)
  assert.equal(result, undefined)
})

// fail-open ———————————————————————————————————————————————————————————

test('returns undefined (fail-open) when auditWriter throws', async () => {
  const throwingWriter = { write: async () => { throw new Error('disk full') } }
  const service = createPostToolUseService({ auditWriter: throwingWriter, clock })
  const result = await service.handle({ toolName: 'Read', toolInput: { filePath: 'x/bdd-methodology/SKILL.md' } })
  assert.equal(result, undefined)
})

test('returns undefined (fail-open) when clock throws', async () => {
  const throwingClock = { now: () => { throw new Error('clock error') } }
  const audit = collectingWriter()
  const service = createPostToolUseService({ auditWriter: audit, clock: throwingClock })
  const result = await service.handle({ toolName: 'Read', toolInput: { filePath: 'x/bdd-methodology/SKILL.md' } })
  assert.equal(result, undefined)
})

test('handle with no arguments returns undefined without throwing', async () => {
  const service = createPostToolUseService({ auditWriter: collectingWriter(), clock })
  const result = await service.handle()
  assert.equal(result, undefined)
})
