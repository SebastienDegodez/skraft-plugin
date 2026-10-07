import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractLoadedSkills } from '../../../plugins/skraft-framework/src/domain/skill-policy.mjs'

test('extractLoadedSkills: a missing or non-string transcript loads nothing', () => {
  assert.deepEqual(extractLoadedSkills(undefined), [])
  assert.deepEqual(extractLoadedSkills(null), [])
  assert.deepEqual(extractLoadedSkills(42), [])
})

test('extractLoadedSkills: null entries and null tool inputs are skipped', () => {
  const transcript = JSON.stringify([
    null,
    { type: 'tool_use', name: 'Skill', input: null },
    { toolName: 'Skill', arguments: null, input: null },
    { type: 'tool_use', name: 'Skill', input: { skill: 'skraft:bdd-methodology' } },
  ])
  assert.deepEqual(extractLoadedSkills(transcript), ['bdd-methodology'])
})

test('extractLoadedSkills: a JSONL null line is skipped', () => {
  const transcript = ['null', JSON.stringify({ type: 'tool_use', name: 'Skill', input: { skill: 'tdd' } })].join('\n')
  assert.deepEqual(extractLoadedSkills(`${transcript}\nnot json`), ['tdd'])
})
