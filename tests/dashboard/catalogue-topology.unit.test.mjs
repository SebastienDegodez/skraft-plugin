import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildCatalogueTopology } from '../../eng/lib/catalogue-topology.mjs'

const skill = (id) => ({ id, directory: id, name: id })
const agent = (id, overrides = {}) => ({
  id,
  name: id,
  path: `agents/${id}.agent.md`,
  kind: 'agent',
  userInvocable: false,
  phase: null,
  phases: [],
  skills: [],
  inputs: [],
  outputs: [],
  childRefs: [],
  dispatchedByRef: null,
  ...overrides,
})

const validAgents = () => [
  agent('backlog-discoverer', { name: 'Discovery entry', userInvocable: true }),
  agent('backlog-planner', { name: 'Planning entry', userInvocable: true }),
  agent('skraft-orchestrator', { name: 'Engineering entry', userInvocable: true, phases: ['RESEARCH'], childRefs: ['Display label impossible to derive'] }),
  agent('researcher', { name: 'Display label impossible to derive', phase: 'RESEARCH', dispatchedByRef: 'Engineering entry', skills: ['research-skill'] }),
]

describe('catalogue topology', () => {
  it('resolves dispatch labels through descriptors and keeps stable IDs and skill order', () => {
    const topology = buildCatalogueTopology({ skills: [skill('research-skill')], agents: validAgents(), frameworkConfig: { phaseOrder: ['RESEARCH'] } })

    deepStrictEqual(topology.roots, ['backlog-discoverer', 'backlog-planner', 'skraft-orchestrator'])
    deepStrictEqual(topology.journeys.engineering.phases, [{ phase: 'RESEARCH', specialist: 'researcher', reviewer: null }])
    deepStrictEqual(topology.agents.find(({ id }) => id === 'researcher').skills, ['research-skill'])
    equal(topology.findings.some(({ code }) => code === 'DISPATCH_TARGET_MISSING'), false)
  })

  it('reports duplicate identities and unresolved dispatch endpoints', () => {
    const agents = validAgents()
    agents.push(agent('researcher', { name: 'Duplicate ID' }))
    agents[2].childRefs.push('Missing child')
    agents[3].dispatchedByRef = 'Missing parent'

    const codes = buildCatalogueTopology({ skills: [skill('research-skill')], agents }).findings.map(({ code }) => code)

    ok(codes.includes('AGENT_ID_DUPLICATE'))
    ok(codes.includes('DISPATCH_TARGET_MISSING'))
    ok(codes.includes('DISPATCH_PARENT_MISSING'))
  })

  it('blocks generated phase, specialist, skill and artifact divergence', () => {
    const agents = validAgents()
    agents[3].inputs = ['source']
    const topology = buildCatalogueTopology({
      skills: [skill('research-skill')],
      agents,
      frameworkConfig: {
        phaseOrder: ['DELIVER'],
        phaseAgents: { RESEARCH: { specialist: 'wrong', reviewer: null } },
        agentSkills: { 'Display label impossible to derive': [{ name: 'wrong' }] },
        agentArtifacts: { 'Display label impossible to derive': { inputs: ['wrong'], outputs: [] } },
      },
    })
    const codes = topology.findings.map(({ code }) => code)

    ok(codes.includes('ENGINEERING_PHASE_ORDER_MISMATCH'))
    ok(codes.includes('ENGINEERING_PHASE_AGENT_MISMATCH'))
    ok(codes.includes('AGENT_SKILLS_CONFIG_MISMATCH'))
    ok(codes.includes('AGENT_ARTIFACTS_CONFIG_MISMATCH'))
  })

  it('blocks product preflight agents dispatched inside engineering', () => {
    const agents = validAgents()
    agents[2].childRefs.unshift('Discovery entry')
    agents[0].dispatchedByRef = 'Engineering entry'

    const topology = buildCatalogueTopology({ skills: [skill('research-skill')], agents })

    ok(topology.findings.some(({ code }) => code === 'PRODUCT_PREFLIGHT_NOT_STANDALONE'))
    ok(topology.findings.some(({ code }) => code === 'PRODUCT_PREFLIGHT_ORCHESTRATED'))
  })
})