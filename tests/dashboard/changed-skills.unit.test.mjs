import { deepStrictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { changedSubjects, exercisedAgents } from '../../eng/lib/changed-skills.mjs'

// The catalogue a pull request is planned against: what each subject reads
// besides its own spec folder, as the planner reads it from the specs.
const SUBJECTS = [
  { kind: 'skill', name: 'outside-in-tdd', companions: ['bdd-methodology'], staged: ['tests/skills/outside-in-tdd/fixtures/orders'] },
  { kind: 'skill', name: 'bdd-methodology', companions: [], staged: [] },
  { kind: 'skill', name: 'software-engineer', companions: [], staged: [] },
  { kind: 'agent', name: 'commit-convention', staged: [], agents: ['software-engineer'] },
  { kind: 'agent', name: 'agent-behavior', staged: [], agents: ['skraft-orchestrator', 'software-engineer'] },
  { kind: 'agent', name: 'backlog-discoverer', staged: [], agents: ['backlog-discoverer', 'discovery-duplicate-lens'] },
  { kind: 'agent', name: 'skraft-docs-orchestrator', staged: ['scripts/scan-drift.mjs', 'eng/lib/yaml-parser.mjs'], agents: ['skraft-docs-orchestrator'] },
]

const selected = (paths, subjects = SUBJECTS) => changedSubjects(paths, subjects)

describe('changedSubjects — which subjects a pull request evaluates', () => {
  it('selects no subject when the pull request changes only tooling or code', () => {
    deepStrictEqual(
      selected([
        'eng/run-vally-evals.sh',
        'eng/vally-adapter/adapt.mjs',
        'eng/vally-agent-executor/executor.mjs',
        'eng/lib/verdict.mjs',
        'eng/plan-eval-matrix.mjs',
        'eng/eval-reuse.mjs',
        'eng/resolve-eval-model.mjs',
        'eng/eval-models.json',
        'scripts/lint-nav.mjs',
        '.github/workflows/skill-evaluation.yml',
        'package.json',
        'package-lock.json',
        'plugins/skraft-framework/engine/application/run-pipeline.mjs',
        'plugins/skraft-framework/.claude-plugin/plugin.json',
        'tests/dashboard/eval-matrix.unit.test.mjs',
        'docs/skill-evaluation.md',
      ]),
      { skills: [], agents: [] }
    )
  })

  it('selects only the skill whose directory changed', () => {
    deepStrictEqual(selected(['plugins/skraft-framework/skills/outside-in-tdd/SKILL.md']), { skills: ['outside-in-tdd'], agents: [] })
    deepStrictEqual(selected(['plugins/skraft-framework/skills/outside-in-tdd/references/red.md', 'plugins/skraft-framework/skills/craft-discipline/SKILL.md']), {
      skills: ['outside-in-tdd'],
      agents: [],
    })
  })

  it('selects the skill a changed companion skill is mounted beside', () => {
    deepStrictEqual(selected(['plugins/skraft-backlog/skills/bdd-methodology/SKILL.md']).skills, ['bdd-methodology', 'outside-in-tdd'])
  })

  it('selects the suites that exercise a changed agent descriptor, in either agent tree, and no other suite', () => {
    const suites = ['agent-behavior', 'commit-convention']
    deepStrictEqual(selected(['plugins/skraft-framework/com.github.copilot/agents/software-engineer.agent.md']), { skills: [], agents: suites })
    deepStrictEqual(selected(['plugins/skraft-framework/com.anthropic.claude-code/agents/software-engineer.md']), { skills: [], agents: suites })
    deepStrictEqual(selected(['plugins/skraft-framework/com.github.copilot/agents/skraft-orchestrator.agent.md']).agents, ['agent-behavior'])
  })

  it('selects a suite through a sub-agent it registers, and the repository agents the handbook suite exercises', () => {
    deepStrictEqual(selected(['plugins/skraft-backlog/com.anthropic.claude-code/agents/discovery-duplicate-lens.md']).agents, ['backlog-discoverer'])
    deepStrictEqual(selected(['.github/agents/skraft-docs-orchestrator.agent.md']).agents, ['skraft-docs-orchestrator'])
  })

  it('selects no suite for a descriptor no suite exercises', () => {
    deepStrictEqual(selected(['plugins/skraft-framework/com.github.copilot/agents/solution-architect.agent.md']), { skills: [], agents: [] })
  })

  it('selects every suite for a descriptor change when a suite does not say which agents it exercises', () => {
    const subjects = [...SUBJECTS, { kind: 'agent', name: 'unreadable', staged: [] }]
    deepStrictEqual(selected(['plugins/skraft-framework/com.github.copilot/agents/solution-architect.agent.md'], subjects).agents, ['unreadable'])
  })

  it('selects a subject whose eval spec folder alone changed', () => {
    deepStrictEqual(selected(['tests/skills/bdd-methodology/eval.yaml']), { skills: ['bdd-methodology'], agents: [] })
    deepStrictEqual(selected(['tests/agents/commit-convention/fixtures/red/README.md']), { skills: [], agents: ['commit-convention'] })
  })

  it('selects a subject when a file its spec stages from outside its folder changed, and only that subject', () => {
    deepStrictEqual(selected(['scripts/scan-drift.mjs']), { skills: [], agents: ['skraft-docs-orchestrator'] })
    deepStrictEqual(selected(['eng/lib/yaml-parser.mjs']), { skills: [], agents: ['skraft-docs-orchestrator'] })
    deepStrictEqual(selected(['scripts/scan-drift.mjs.bak', 'eng/lib/yaml-parser.test.mjs']), { skills: [], agents: [] })
  })

  it('never lets a skill and a suite that share a name select each other', () => {
    deepStrictEqual(selected(['tests/skills/software-engineer/eval.yaml']), { skills: ['software-engineer'], agents: [] })
  })

  it('accepts Windows separators', () => {
    deepStrictEqual(selected(['tests\\skills\\bdd-methodology\\eval.yaml']).skills, ['bdd-methodology'])
  })
})

describe('exercisedAgents', () => {
  it('lists every agent and sub-agent the stimuli of a suite name, once each', () => {
    const spec = {
      stimuli: [
        { name: 'one', tags: { agent: 'skraft-orchestrator', subagents: ['software-engineer'] } },
        { name: 'two', tags: { agent: ['software-engineer'], subagents: 'test-integrity-lens' } },
        { name: 'three', tags: { suite: 'x' } },
      ],
    }
    deepStrictEqual(exercisedAgents(spec), ['skraft-orchestrator', 'software-engineer', 'test-integrity-lens'])
  })

  it('returns nothing for a spec that names no agent', () => {
    deepStrictEqual(exercisedAgents(null), [])
  })
})
