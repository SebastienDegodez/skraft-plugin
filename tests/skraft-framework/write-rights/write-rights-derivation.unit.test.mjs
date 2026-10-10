// Unit — config:build derives each agent's write rights from the pipeline config:
// phaseAgents, agentDispatchers, the launcher and the outputs each agent declares, with the
// workspace phases the pipeline definition names. Nothing is hard-coded per agent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFrameworkConfig } from '../../../plugins/skraft-framework/src/domain/framework-config-policy.mjs'
import { deriveWriteRights } from '../../../plugins/skraft-framework/src/domain/write-rights-policy.mjs'
import { WORKSPACE_PHASES } from '../../../plugins/skraft-framework/src/domain/pipeline/pipeline-definition.mjs'

const tracked = (path) => `.copilot-tracking/skraft-plans/{projectSlug}/${path}`
const agent = (id, name, fields = {}) => ({ id, name, skills: [], onDemandSkills: [], inputs: [], context: [], outputs: [], ...fields })

const DESCRIPTORS = [
  agent('skraft-orchestrator', 'Skraft - Orchestrator'),
  agent('solution-architect', 'Skraft - Solution Architect', { phase: 'DESIGN', dispatchedBy: 'skraft-pipeline', outputs: ['docs/adr/adr-{NNN}-{slug}.md'] }),
  agent('solution-architect-reviewer', 'Skraft - Solution Architect Reviewer', { phase: 'DESIGN-REVIEW', dispatchedBy: 'skraft-pipeline', outputs: [tracked('reviews/{date}/design-review-{N}.md')] }),
  agent('acceptance-designer', 'Skraft - Acceptance Designer', { phase: 'DISTILL', dispatchedBy: 'skraft-pipeline' }),
  agent('software-engineer', 'Skraft - Software Engineer', { phase: 'DELIVER', dispatchedBy: 'skraft-pipeline' }),
  agent('software-engineer-reviewer', 'Skraft - Software Engineer Reviewer', {
    phase: 'DELIVER-REVIEW', dispatchedBy: 'skraft-pipeline',
    outputs: [tracked('reviews/{date}/deliver-review-{N}.md'), `${tracked('reviews/{date}/diff-{story}.patch')} (optional, Phase 2 diff the lenses read)`, tracked('reviews/{date}/deliver-review-{N}.md')],
  }),
  agent('contract-testing-worker', 'contract-testing-worker', { dispatchedBy: 'software-engineer', outputs: ['structured result block (stack, files[]) — NO commit'] }),
  agent('stub-worker', 'stub-worker', { dispatchedBy: 'contract-testing-worker' }),
  agent('quality-gates-lens', 'quality-gates-lens', { dispatchedBy: 'software-engineer-reviewer' }),
  agent('sub-lens', 'sub-lens', { dispatchedBy: 'quality-gates-lens', outputs: [tracked('reviews/{date}/sub-{story}.md')] }),
  agent('backlog-planner', 'Skraft - Backlog Planner'),
  agent('planning-dor-lens', 'planning-dor-lens', { dispatchedBy: 'backlog-planner' }),
]

test('config:build writes writeRights: one entry per pipeline agent, by role', () => {
  const { writeRights } = buildFrameworkConfig(DESCRIPTORS)
  assert.deepEqual(writeRights, {
    'contract-testing-worker': { role: 'worker', phase: 'DELIVER', workspace: true },
    'quality-gates-lens': { role: 'lens', phase: 'DELIVER', files: [] },
    'Skraft - Acceptance Designer': { role: 'specialist', phase: 'DISTILL', workspace: true },
    'Skraft - Orchestrator': { role: 'orchestrator', files: [] },
    'Skraft - Software Engineer': { role: 'specialist', phase: 'DELIVER', workspace: true },
    'Skraft - Software Engineer Reviewer': {
      role: 'reviewer', phase: 'DELIVER',
      files: [tracked('reviews/{date}/deliver-review-{N}.md'), tracked('reviews/{date}/diff-{story}.patch')],
    },
    'Skraft - Solution Architect': { role: 'specialist', phase: 'DESIGN', workspace: false },
    'Skraft - Solution Architect Reviewer': { role: 'reviewer', phase: 'DESIGN', files: [tracked('reviews/{date}/design-review-{N}.md')] },
    'stub-worker': { role: 'worker', phase: 'DELIVER', workspace: true },
    'sub-lens': { role: 'lens', phase: 'DELIVER', files: [tracked('reviews/{date}/sub-{story}.md')] },
  })
  assert.equal(Object.hasOwn(writeRights, 'planning-dor-lens'), false, 'an agent outside the pipeline is not governed')
  assert.deepEqual(Object.keys(writeRights), Object.keys(writeRights).slice().sort((x, y) => x.localeCompare(y)), 'a stable order: config:check compares the file')
})

test('the workspace phases are the pipeline definition\'s: DISTILL and DELIVER', () => {
  assert.deepEqual([...WORKSPACE_PHASES], ['DISTILL', 'DELIVER'])
})

test('an agent that dispatches a phase agent is an orchestrator; the pipeline code is not an agent', () => {
  const rights = deriveWriteRights({
    launcher: 'launcher', dispatcher: 'skraft-pipeline',
    phaseOrder: ['DELIVER'],
    phaseAgents: { DELIVER: { specialist: 'engineer', reviewer: 'reviewer' } },
    agentDispatchers: { engineer: 'conductor', reviewer: 'skraft-pipeline', helper: 'conductor' },
    agentArtifacts: { launcher: {}, conductor: {}, engineer: {}, reviewer: {}, helper: {}, 'skraft-pipeline': {} },
    workspacePhases: ['DELIVER'],
  })
  assert.deepEqual(Object.keys(rights).sort(), ['conductor', 'engineer', 'launcher', 'reviewer'])
  assert.equal(rights.conductor.role, 'orchestrator')
  assert.equal(rights.launcher.role, 'orchestrator')
})

test('nothing to derive from an empty or partial config', () => {
  assert.deepEqual(deriveWriteRights(), {})
  assert.deepEqual(deriveWriteRights({ launcher: 'ghost', phaseOrder: ['DELIVER'], phaseAgents: { DELIVER: { specialist: 'ghost' } } }), {}, 'an agent no descriptor declares is not one')
  assert.deepEqual(deriveWriteRights({ phaseOrder: ['RESEARCH'], phaseAgents: {}, agentArtifacts: { a: {} } }), {})
})

test('a phase agent also named launcher keeps the launcher role', () => {
  const rights = deriveWriteRights({
    launcher: 'both', phaseOrder: ['DELIVER'], phaseAgents: { DELIVER: { specialist: 'both', reviewer: 'both' } },
    agentArtifacts: { both: {} }, workspacePhases: ['DELIVER'],
  })
  assert.deepEqual(rights, { both: { role: 'orchestrator', files: [] } })
})
