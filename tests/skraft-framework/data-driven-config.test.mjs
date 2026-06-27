import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFrameworkConfig,
  DEFAULT_SKILL_POLICY,
} from '../../plugins/src/domain/framework-config-policy.mjs'

// --- descriptor factories (the pure function's input boundary) ---

const orchestrator = (phases) => ({
  name: 'skraft-orchestrator',
  dispatchedBy: null,
  phases,
  skills: [],
  inputs: [],
  outputs: [],
})

const agent = ({
  name,
  phase,
  dispatchedBy = 'skraft-orchestrator',
  skills = [],
  inputs = [],
  outputs = [],
}) => ({ name, phase, dispatchedBy, skills, inputs, outputs })

const PHASES = ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL', 'DELIVER']

// A small but realistic pipeline: one specialist + one reviewer per phase.
const pipeline = () => [
  orchestrator(PHASES),
  agent({ name: 'backlog-discoverer', phase: 'DISCOVER' }),
  agent({ name: 'backlog-discoverer-reviewer', phase: 'DISCOVER' }),
  agent({ name: 'backlog-planner', phase: 'DISCUSS' }),
  agent({ name: 'backlog-planner-reviewer', phase: 'DISCUSS' }),
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

test('phase order mirrors the order the orchestrator declares', () => {
  const config = buildFrameworkConfig(pipeline())
  assert.deepEqual(config.phaseOrder, PHASES)
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
    orchestrator(['DESIGN', 'DELIVER']),
    agent({ name: 'solution-architect', phase: 'DESIGN' }),
    agent({ name: 'solution-architect-reviewer', phase: 'DESIGN-REVIEW' }),
    agent({ name: 'software-engineer', phase: 'DELIVER' }),
    agent({ name: 'software-engineer-reviewer', phase: 'DELIVER-REVIEW' }),
  ]
  const config = buildFrameworkConfig(descriptors)
  assert.equal(config.phaseAgents.DESIGN.reviewer, 'solution-architect-reviewer')
  assert.equal(config.phaseAgents.DELIVER.reviewer, 'software-engineer-reviewer')
})

test('an agent that is not dispatched by the orchestrator is excluded from phase agents', () => {
  const descriptors = [
    ...pipeline(),
    agent({ name: 'mock-integration-worker', phase: 'DELIVER', dispatchedBy: 'software-engineer' }),
  ]
  const config = buildFrameworkConfig(descriptors)
  assert.equal(config.phaseAgents.DELIVER.specialist, 'software-engineer')
})

test('a worker is never promoted to specialist even when it is the only candidate in a phase', () => {
  const descriptors = [
    orchestrator(['DELIVER']),
    agent({ name: 'mock-integration-worker', phase: 'DELIVER', dispatchedBy: 'software-engineer' }),
  ]
  const config = buildFrameworkConfig(descriptors)
  assert.deepEqual(config.phaseAgents.DELIVER, { specialist: null, reviewer: null })
})

test('a declared phase with no specialist or reviewer yields null slots', () => {
  const config = buildFrameworkConfig([orchestrator(['DISCOVER', 'DESIGN'])])
  assert.deepEqual(config.phaseAgents.DESIGN, { specialist: null, reviewer: null })
})

test('the phase order is empty when no orchestrator declares one', () => {
  const config = buildFrameworkConfig([agent({ name: 'lonely', phase: 'DESIGN' })])
  assert.deepEqual(config.phaseOrder, [])
  assert.deepEqual(config.phaseAgents, {})
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
