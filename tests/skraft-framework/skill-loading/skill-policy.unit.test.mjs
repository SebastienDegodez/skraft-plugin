import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mandatorySkillsFor,
  missingSkills,
  extractLoadedSkills,
  isEagerSkill
} from '../../../plugins/skraft-framework/src/domain/skill-policy.mjs'

const CONFIG = {
  agentSkills: {
    'acceptance-designer': [
      { name: 'bdd-methodology', policy: 'verify' },
      { name: 'outside-in-tdd', policy: 'verify' }
    ],
    'skraft-orchestrator': []
  }
}

// mandatorySkillsFor —————————————————————————————————————————————————

test('mandatorySkillsFor returns skill names for a known agent', () => {
  const result = mandatorySkillsFor('acceptance-designer', CONFIG)
  assert.deepEqual(result, [
    { name: 'bdd-methodology', policy: 'verify' },
    { name: 'outside-in-tdd', policy: 'verify' }
  ])
})

test('mandatorySkillsFor returns empty array for agent with no skills', () => {
  assert.deepEqual(mandatorySkillsFor('skraft-orchestrator', CONFIG), [])
})

test('mandatorySkillsFor returns empty array for unknown agent', () => {
  assert.deepEqual(mandatorySkillsFor('unknown-agent', CONFIG), [])
})

test('mandatorySkillsFor handles string skill entries (no policy object)', () => {
  const config = { agentSkills: { agent: ['skill-a', 'skill-b'] } }
  assert.deepEqual(mandatorySkillsFor('agent', config), [
    { name: 'skill-a', policy: 'verify' },
    { name: 'skill-b', policy: 'verify' }
  ])
})

test('mandatorySkillsFor returns empty array when config is null', () => {
  assert.deepEqual(mandatorySkillsFor('agent', null), [])
})

test('mandatorySkillsFor returns empty array when agentSkills property is absent from config', () => {
  // Kills OptionalChaining mutant: config?.agentSkills?.[agentName] vs config?.agentSkills[agentName]
  // When agentSkills is missing, agentSkills[agentName] would throw without the second ?.
  assert.deepEqual(mandatorySkillsFor('agent', {}), [])
})

// missingSkills ———————————————————————————————————————————————————————

test('missingSkills returns skills not present in readSkills', () => {
  const result = missingSkills(['bdd-methodology'], ['bdd-methodology', 'outside-in-tdd'])
  assert.deepEqual(result, ['outside-in-tdd'])
})

test('missingSkills returns empty when all required skills are read', () => {
  assert.deepEqual(missingSkills(['bdd-methodology', 'outside-in-tdd'], ['bdd-methodology', 'outside-in-tdd']), [])
})

test('missingSkills returns all required when nothing was read', () => {
  assert.deepEqual(missingSkills([], ['bdd-methodology']), ['bdd-methodology'])
})

test('missingSkills preserves order of missing skills', () => {
  const result = missingSkills([], ['a', 'b', 'c'])
  assert.deepEqual(result, ['a', 'b', 'c'])
})

// extractLoadedSkills ——————————————————————————————————————————————————
// A skill counts as loaded only through a tool call in the transcript: the Skill tool,
// or a read of the skill's SKILL.md. A mention in text or in a prompt proves nothing.

const toolUse = (name, input) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't', name, input }] } })
const jsonl = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n') + '\n'

test('extractLoadedSkills: the Skill tool loads a skill, plugin prefix removed', () => {
  const transcript = jsonl(toolUse('Skill', { skill: 'skraft:outside-in-tdd' }), toolUse('Skill', { skill: 'bdd-methodology' }))
  assert.deepEqual(extractLoadedSkills(transcript).sort(), ['bdd-methodology', 'outside-in-tdd'])
})

test('extractLoadedSkills: a read of SKILL.md loads a skill, whatever the read tool', () => {
  const transcript = jsonl(
    toolUse('Read', { file_path: '/p/plugins/skraft-framework/skills/bdd-methodology/SKILL.md' }),
    { type: 'tool.execution_start', data: { toolName: 'view', arguments: { path: 'skills/outside-in-tdd/SKILL.md' } } },
  )
  assert.deepEqual(extractLoadedSkills(transcript).sort(), ['bdd-methodology', 'outside-in-tdd'])
})

test('extractLoadedSkills: a mention in text, a prompt or a tool result loads nothing', () => {
  const transcript = jsonl(
    { type: 'user', message: { role: 'user', content: 'Load outside-in-tdd/SKILL.md before coding' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'I read bdd-methodology/SKILL.md' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'see skills/mutation-testing/SKILL.md' }] } },
    toolUse('Read', { file_path: 'docs/skills/outside-in-tdd/SKILL.md.bak' }),
    toolUse('Grep', { pattern: 'x', path: 'skills/craft-discipline/SKILL.md' }),
  )
  assert.deepEqual(extractLoadedSkills(transcript), [])
})

test('extractLoadedSkills: an inline array transcript and malformed lines are tolerated', () => {
  assert.deepEqual(extractLoadedSkills(JSON.stringify([toolUse('Skill', { skill: 'bdd-methodology' })])), ['bdd-methodology'])
  assert.deepEqual(extractLoadedSkills(`{ not json\n${JSON.stringify(toolUse('Skill', { skill: 'x-y' }))}\n`), ['x-y'])
  assert.deepEqual(extractLoadedSkills(null), [])
  assert.deepEqual(extractLoadedSkills(''), [])
})

test('extractLoadedSkills: every read tool name and every Skill input field', () => {
  for (const tool of ['Read', 'view', 'read_file', 'ReadFile']) {
    assert.deepEqual(extractLoadedSkills(jsonl(toolUse(tool, { path: 'skills/a-b/SKILL.md' }))), ['a-b'], tool)
  }
  for (const field of ['skill', 'name', 'command']) {
    assert.deepEqual(extractLoadedSkills(jsonl(toolUse('skill', { [field]: 'plugin:skraft:c-d' }))), ['c-d'], field)
  }
  assert.deepEqual(extractLoadedSkills(jsonl(toolUse('Read', { filePath: 'x\\skills\\e-f\\SKILL.md' }))), ['e-f'])
})

test('extractLoadedSkills: a tool call without a usable skill or path loads nothing', () => {
  const calls = [
    toolUse('Skill', { skill: '' }),
    toolUse('Skill', { skill: 7 }),
    toolUse('Skill', {}),
    toolUse('Read', { file_path: 7 }),
    toolUse('Read', {}),
    toolUse('Skill', 'bdd-methodology'),
    { type: 'tool_use', name: 7, input: { skill: 'x-y' } },
    { type: 'tool_use', name: 'Skill', arguments: { skill: 'x-y' } },
    { type: 'tool_result', content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'x-y' } }] },
    { toolName: 'Skill' },
    { name: 'Skill', input: { skill: 'x-y' } },
  ]
  assert.deepEqual(extractLoadedSkills(jsonl(...calls)), [])
})

test('extractLoadedSkills: a single JSON object, blank lines and whitespace-only transcripts', () => {
  assert.deepEqual(extractLoadedSkills(JSON.stringify(toolUse('Skill', { skill: 'solo' }))), ['solo'])
  assert.deepEqual(extractLoadedSkills(`\n  \n${JSON.stringify(toolUse('Skill', { skill: 'after-blank' }))}\n\n`), ['after-blank'])
  assert.deepEqual(extractLoadedSkills('   \n  '), [])
  assert.deepEqual(extractLoadedSkills(42), [])
})

test('extractLoadedSkills: a harness event names its call with toolName or name plus arguments', () => {
  const events = [
    { type: 'tool.execution_start', data: { toolName: 'skill', arguments: { skill: 'from-event' } } },
    { type: 'call', name: 'view', arguments: { path: 'skills/by-name/SKILL.md' } },
  ]
  assert.deepEqual(extractLoadedSkills(jsonl(...events)).sort(), ['by-name', 'from-event'])
})

test('isEagerSkill: only an eager policy, tolerating a missing entry', () => {
  assert.equal(isEagerSkill({ name: 'x', policy: 'eager' }), true)
  assert.equal(isEagerSkill({ name: 'x', policy: 'verify' }), false)
  assert.equal(isEagerSkill(undefined), false)
})
