import { test } from 'node:test'
import assert from 'node:assert/strict'

import { validateSkillDeclarations } from '../../../eng/lib/skill-declaration-policy.mjs'

test('a skill listed as both mandatory and on-demand is a violation naming the agent and the skill', () => {
  const violations = validateSkillDeclarations([
    { name: 'software-engineer', skills: ['outside-in-tdd', 'mutation-testing'], onDemandSkills: ['mutation-testing'] },
    { name: 'acceptance-designer', skills: ['bdd-methodology'], onDemandSkills: ['qa-reporting'] },
    { name: 'bare' },
  ])
  assert.deepEqual(violations, [{
    agent: 'software-engineer',
    code: 'SKILL_DECLARED_TWICE',
    message: "'mutation-testing' is listed under both skills and on_demand_skills; keep it in one list",
  }])
  assert.ok(Object.isFrozen(violations))
})

test('metadata holds on_demand_skills only: a skills copy and any other field are violations', () => {
  const violations = validateSkillDeclarations([
    { name: 'software-engineer', skills: ['outside-in-tdd'], metadataKeys: ['skills', 'on_demand_skills'] },
    { name: 'solution-architect', skills: [], metadataKeys: ['dispatched_by', 'phase'] },
    { name: 'coverage-lens', skills: ['acceptance-review-criteria'], metadataKeys: ['on_demand_skills'] },
  ])
  assert.deepEqual(violations.map(({ agent, code }) => `${agent} ${code}`), [
    'software-engineer SKILL_IN_METADATA',
    'solution-architect METADATA_FIELD_UNREAD',
    'solution-architect METADATA_FIELD_UNREAD',
  ])
  assert.equal(violations[1].message, 'metadata.dispatched_by is read by nothing; remove it (phases and dispatch live in the workflow)')
})
