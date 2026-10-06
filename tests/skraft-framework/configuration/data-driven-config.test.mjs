import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFrameworkConfig,
  validateSkillDeclarations,
  DEFAULT_SKILL_POLICY,
  ON_DEMAND_SKILL_POLICY,
} from '../../../plugins/skraft-framework/src/domain/framework-config-policy.mjs'
import { PIPELINE_DISPATCHER, PIPELINE_PHASES } from '../../../plugins/skraft-framework/src/domain/pipeline/pipeline-definition.mjs'

// --- descriptor factories (the pure function's input boundary) ---

// The launcher: a root that starts the pipeline; the pipeline itself is declared in code.
const launcher = () => ({
  id: 'skraft-orchestrator',
  name: 'Skraft - Orchestrator',
  dispatchedBy: null,
  userInvocable: true,
  skills: [],
  instructions: [],
  inputs: [],
  outputs: [],
})

const agent = ({
  id,
  name,
  phase,
  dispatchedBy = PIPELINE_DISPATCHER,
  skills = [],
  instructions = [],
  inputs = [],
  outputs = [],
}) => ({ id: id ?? name, name, phase, dispatchedBy, skills, instructions, inputs, outputs })

// A small but realistic pipeline: one specialist + one reviewer per phase.
const pipeline = () => [
  launcher(),
  agent({ name: 'solution-researcher', phase: 'RESEARCH' }),
  agent({
    name: 'solution-architect',
    phase: 'DESIGN',
    skills: ['architecture-patterns', 'architecture-decisions'],
  }),
  agent({ name: 'solution-architect-reviewer', phase: 'DESIGN' }),
  agent({
    name: 'acceptance-designer',
    phase: 'DISTILL',
    inputs: ['stories-{milestone}.md', 'ac-draft-{story}.md'],
    outputs: ['{feature}.feature', 'test-plan-{story}.md'],
  }),
  agent({ name: 'acceptance-designer-reviewer', phase: 'DISTILL' }),
  agent({ name: 'software-engineer', phase: 'DELIVER' }),
  agent({ name: 'software-engineer-reviewer', phase: 'DELIVER' }),
]

test('the phase order is the pipeline\'s own, declared in code, and the config names its dispatcher and launcher', () => {
  const config = buildFrameworkConfig(pipeline())
  assert.deepEqual(config.phaseOrder, ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
  assert.deepEqual(config.phaseOrder, [...PIPELINE_PHASES])
  assert.deepEqual({ ...config.pipeline }, { dispatcher: 'skraft-pipeline', launcher: 'Skraft - Orchestrator' })
})

test('each phase pairs its specialist with its reviewer', () => {
  const config = buildFrameworkConfig(pipeline())
  assert.deepEqual(config.phaseAgents.DESIGN, {
    specialist: 'solution-architect',
    reviewer: 'solution-architect-reviewer',
  })
  assert.deepEqual(config.phaseAgents.DELIVER, {
    specialist: 'software-engineer',
    reviewer: 'software-engineer-reviewer',
  })
})

test('a reviewer that declares a "-REVIEW" phase is paired under its base phase', () => {
  const descriptors = [
    launcher(),
    agent({ name: 'solution-architect', phase: 'DESIGN' }),
    agent({ name: 'solution-architect-reviewer', phase: 'DESIGN-REVIEW' }),
    agent({ name: 'software-engineer', phase: 'DELIVER' }),
    agent({ name: 'software-engineer-reviewer', phase: 'DELIVER-REVIEW' }),
  ]
  const config = buildFrameworkConfig(descriptors)
  assert.equal(config.phaseAgents.DESIGN.reviewer, 'solution-architect-reviewer')
  assert.equal(config.phaseAgents.DELIVER.reviewer, 'software-engineer-reviewer')
})

test('an agent that is not dispatched by the pipeline is excluded from phase agents', () => {
  const descriptors = [
    ...pipeline(),
    agent({ name: 'mock-integration-worker', phase: 'DELIVER', dispatchedBy: 'software-engineer' }),
  ]
  const config = buildFrameworkConfig(descriptors)
  assert.equal(config.phaseAgents.DELIVER.specialist, 'software-engineer')
})

test('a worker is never promoted to specialist even when it is the only candidate in a phase', () => {
  const descriptors = [
    launcher(),
    agent({ name: 'mock-integration-worker', phase: 'DELIVER', dispatchedBy: 'software-engineer' }),
  ]
  const config = buildFrameworkConfig(descriptors)
  assert.deepEqual(config.phaseAgents.DELIVER, { specialist: null, reviewer: null })
})

test('a phase with no specialist or reviewer yields null slots', () => {
  const config = buildFrameworkConfig([launcher()])
  assert.deepEqual(config.phaseAgents.DESIGN, { specialist: null, reviewer: null })
})

test('no agent changes the phase order, and no launcher leaves pipeline.launcher null', () => {
  const config = buildFrameworkConfig([{ ...agent({ name: 'lonely', phase: 'DESIGN' }), phases: ['DESIGN'] }])
  assert.deepEqual(config.phaseOrder, [...PIPELINE_PHASES])
  assert.equal(config.pipeline.launcher, null)
})

test('mandatory skills are carried with the default verification policy', () => {
  const config = buildFrameworkConfig(pipeline())
  assert.deepEqual(config.agentSkills['solution-architect'], [
    { name: 'architecture-patterns', policy: DEFAULT_SKILL_POLICY },
    { name: 'architecture-decisions', policy: DEFAULT_SKILL_POLICY },
  ])
  assert.equal(DEFAULT_SKILL_POLICY, 'verify')
})

test('an agent that declares no skills carries an empty skill set', () => {
  const config = buildFrameworkConfig(pipeline())
  assert.deepEqual(config.agentSkills['software-engineer'], [])
})

test('agent aliases are projected deterministically', () => {
  const config = buildFrameworkConfig(pipeline())
  assert.equal(config.agentAliases['solution-researcher'], 'solution-researcher')
  assert.equal(config.agentAliases['skraft-orchestrator'], 'Skraft - Orchestrator')
})

test('expected artifacts are collected from required inputs and produced outputs', () => {
  const config = buildFrameworkConfig(pipeline())
  assert.deepEqual(config.agentArtifacts['acceptance-designer'], {
    inputs: ['stories-{milestone}.md', 'ac-draft-{story}.md'],
    outputs: ['{feature}.feature', 'test-plan-{story}.md'],
  })
})

test('a bare descriptor without skills, inputs or outputs gets empty defaults', () => {
  const config = buildFrameworkConfig([{ name: 'bare' }])
  assert.deepEqual(config.agentSkills['bare'], [])
  assert.deepEqual(config.agentArtifacts['bare'], { inputs: [], outputs: [] })
})

test('the produced configuration is deterministic and frozen', () => {
  const a = buildFrameworkConfig(pipeline())
  const b = buildFrameworkConfig(pipeline())
  assert.deepEqual(a, b)
  assert.throws(() => {
    a.phaseOrder.push('TAMPER')
  })
})

test('each dispatched agent records its dispatcher by display name', () => {
  const config = buildFrameworkConfig([
    launcher(),
    agent({ id: 'software-engineer', name: 'Skraft - Software Engineer', phase: 'DELIVER' }),
    agent({ id: 'contract-testing-worker', name: 'contract-testing-worker', dispatchedBy: 'software-engineer' }),
    agent({ id: 'cold-reader-lens', name: 'cold-reader-lens', dispatchedBy: 'unknown-parent' }),
  ])
  assert.deepEqual({ ...config.agentDispatchers }, {
    'Skraft - Software Engineer': 'skraft-pipeline',
    'contract-testing-worker': 'Skraft - Software Engineer',
    'cold-reader-lens': 'unknown-parent',
  })
})

test('on-demand skills follow the mandatory skills, each list in declaration order', () => {
  const config = buildFrameworkConfig([
    launcher(),
    {
      ...agent({ name: 'software-engineer', phase: 'DELIVER', skills: ['outside-in-tdd', 'craft-discipline'] }),
      onDemandSkills: ['mutation-testing', 'qa-reporting'],
    },
  ])
  assert.deepEqual(config.agentSkills['software-engineer'], [
    { name: 'outside-in-tdd', policy: DEFAULT_SKILL_POLICY },
    { name: 'craft-discipline', policy: DEFAULT_SKILL_POLICY },
    { name: 'mutation-testing', policy: ON_DEMAND_SKILL_POLICY },
    { name: 'qa-reporting', policy: ON_DEMAND_SKILL_POLICY },
  ])
  assert.equal(ON_DEMAND_SKILL_POLICY, 'on-demand')
})

test('an agent with only on-demand skills gets them all under the on-demand policy', () => {
  const config = buildFrameworkConfig([{ ...launcher(), onDemandSkills: ['qa-reporting'] }])
  assert.deepEqual(config.agentSkills['Skraft - Orchestrator'], [{ name: 'qa-reporting', policy: ON_DEMAND_SKILL_POLICY }])
})

test('a skill listed as both mandatory and on-demand is a violation naming the agent and the skill', () => {
  const violations = validateSkillDeclarations([
    { name: 'software-engineer', skills: ['outside-in-tdd', 'mutation-testing'], onDemandSkills: ['mutation-testing', 'qa-reporting'] },
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

test('context inputs are projected per agent, apart from the required inputs', () => {
  const config = buildFrameworkConfig([
    launcher(),
    {
      ...agent({ name: 'software-engineer', phase: 'DELIVER', inputs: ['test-plan-{story}.md'] }),
      context: ['contracts-{story}.md', 'docs/adr/decisions-index.md'],
    },
    agent({ name: 'software-engineer-reviewer', phase: 'DELIVER' }),
  ])
  assert.deepEqual(config.agentContext['software-engineer'], ['contracts-{story}.md', 'docs/adr/decisions-index.md'])
  assert.deepEqual(config.agentContext['software-engineer-reviewer'], [])
  assert.deepEqual(config.agentArtifacts['software-engineer'].inputs, ['test-plan-{story}.md'])
})
