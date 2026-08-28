import { deepStrictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { changedAgentSuites, changedSkills } from '../../eng/lib/changed-skills.mjs'

describe('changedSkills', () => {
  it('maps a skill source path to its skill name', () => {
    deepStrictEqual(changedSkills(['plugins/skraft-framework/skills/outside-in-tdd/SKILL.md']), ['outside-in-tdd'])
  })

  it('maps an eval spec path to its skill name', () => {
    deepStrictEqual(changedSkills(['tests/skills/outside-in-tdd/eval.yaml']), ['outside-in-tdd'])
  })

  it('de-duplicates and sorts multiple changed skills', () => {
    const paths = [
      'plugins/skraft-framework/skills/zeta/SKILL.md',
      'tests/skills/alpha/eval.yaml',
      'plugins/skraft-framework/skills/alpha/reference.md',
    ]
    deepStrictEqual(changedSkills(paths), ['alpha', 'zeta'])
  })

  it('ignores paths outside a skill tree', () => {
    deepStrictEqual(changedSkills(['docs/skill-evaluation.md', 'eng/run-vally-evals.sh']), [])
  })

  it('ignores an empty change set', () => {
    deepStrictEqual(changedSkills([]), [])
  })

  // The plugin ships far more skills than eval specs, so a PR that edits a
  // spec-less skill used to hand CI a name the runner exits non-zero on —
  // taking the whole pre-merge job down after it had already paid for the
  // skills that did have specs.
  it('drops a changed skill that carries no eval spec', () => {
    const paths = [
      'plugins/skraft-framework/skills/craft-discipline/SKILL.md',
      'plugins/skraft-framework/skills/outside-in-tdd/SKILL.md',
    ]
    deepStrictEqual(changedSkills(paths, { evaluable: ['outside-in-tdd'] }), ['outside-in-tdd'])
  })

  it('drops a skill whose eval spec the change itself deleted', () => {
    const paths = ['tests/skills/red-synthesize-green/eval.yaml']
    deepStrictEqual(changedSkills(paths, { evaluable: ['outside-in-tdd'] }), [])
  })

  it('yields nothing rather than everything when no skill is evaluable', () => {
    const paths = ['plugins/skraft-framework/skills/craft-discipline/SKILL.md']
    deepStrictEqual(changedSkills(paths, { evaluable: [] }), [])
  })

  it('filters nothing when the caller does not say what is evaluable', () => {
    const paths = ['plugins/skraft-framework/skills/craft-discipline/SKILL.md']
    deepStrictEqual(changedSkills(paths), ['craft-discipline'])
  })
})

describe('changedAgentSuites', () => {
  const suites = ['agent-behavior', 'software-engineer-delivery']

  it('maps a suite spec path to its suite name', () => {
    deepStrictEqual(changedAgentSuites(['tests/agents/agent-behavior/eval.yaml'], { suites }), ['agent-behavior'])
  })

  it('re-runs every suite when an agent descriptor changed, since no path links the two', () => {
    const paths = ['plugins/skraft-framework/com.github.copilot/agents/software-engineer.agent.md']
    deepStrictEqual(changedAgentSuites(paths, { suites }), suites)
  })

  it('re-runs every suite when the Claude mirror changed', () => {
    const paths = ['plugins/skraft-framework/com.anthropic.claude-code/agents/software-engineer.md']
    deepStrictEqual(changedAgentSuites(paths, { suites }), suites)
  })

  it('ignores a skill change', () => {
    deepStrictEqual(changedAgentSuites(['tests/skills/outside-in-tdd/eval.yaml'], { suites }), [])
  })

  it('ignores an empty change set', () => {
    deepStrictEqual(changedAgentSuites([], { suites }), [])
  })
})
