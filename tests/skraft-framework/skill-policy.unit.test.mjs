import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mandatorySkillsFor,
  missingSkills,
  extractReadSkills
} from '../../plugins/src/domain/skill-policy.mjs'

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
  assert.deepEqual(result, ['bdd-methodology', 'outside-in-tdd'])
})

test('mandatorySkillsFor returns empty array for agent with no skills', () => {
  assert.deepEqual(mandatorySkillsFor('skraft-orchestrator', CONFIG), [])
})

test('mandatorySkillsFor returns empty array for unknown agent', () => {
  assert.deepEqual(mandatorySkillsFor('unknown-agent', CONFIG), [])
})

test('mandatorySkillsFor handles string skill entries (no policy object)', () => {
  const config = { agentSkills: { agent: ['skill-a', 'skill-b'] } }
  assert.deepEqual(mandatorySkillsFor('agent', config), ['skill-a', 'skill-b'])
})

test('mandatorySkillsFor returns empty array when config is null', () => {
  assert.deepEqual(mandatorySkillsFor('agent', null), [])
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

// extractReadSkills ———————————————————————————————————————————————————

test('extractReadSkills finds a skill from a string transcript', () => {
  const result = extractReadSkills('read plugins/skills/bdd-methodology/SKILL.md for the session')
  assert.ok(result.includes('bdd-methodology'))
})

test('extractReadSkills finds multiple skills from a string', () => {
  const transcript = 'loaded outside-in-tdd/SKILL.md and bdd-methodology/SKILL.md'
  const result = extractReadSkills(transcript)
  assert.ok(result.includes('outside-in-tdd'))
  assert.ok(result.includes('bdd-methodology'))
})

test('extractReadSkills deduplicates repeated reads', () => {
  const transcript = 'bdd-methodology/SKILL.md bdd-methodology/SKILL.md'
  const result = extractReadSkills(transcript)
  assert.equal(result.filter((s) => s === 'bdd-methodology').length, 1)
})

test('extractReadSkills handles array transcript (serialises to JSON)', () => {
  const transcript = [{ content: 'reading bdd-methodology/SKILL.md' }]
  const result = extractReadSkills(transcript)
  assert.ok(result.includes('bdd-methodology'))
})

test('extractReadSkills returns empty array when no SKILL.md present', () => {
  assert.deepEqual(extractReadSkills('no skills here'), [])
})

test('extractReadSkills handles null transcript without throwing', () => {
  assert.deepEqual(extractReadSkills(null), [])
})
