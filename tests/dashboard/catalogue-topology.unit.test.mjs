import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildCatalogueTopology, ENGINE_DISPATCHER } from '../../eng/lib/catalogue-topology.mjs'

const skill = (id) => ({ id, directory: id, name: id })
const agent = (id, overrides = {}) => ({
  id,
  name: id,
  path: `plugins/${overrides.plugin ?? 'framework'}/com.github.copilot/agents/${id}.agent.md`,
  kind: 'agent',
  userInvocable: false,
  skills: [],
  childRefs: [],
  ...overrides,
})

const validAgents = () => [
  agent('backlog-discoverer', { name: 'Discovery entry', userInvocable: true, plugin: 'backlog' }),
  agent('backlog-planner', { name: 'Planning entry', userInvocable: true, plugin: 'backlog' }),
  agent('skraft-orchestrator', { name: 'Engineering entry', userInvocable: true }),
  agent('researcher', { name: 'Display label impossible to derive', skills: ['research-skill'] }),
  agent('consistency-lens', { kind: 'lens' }),
  agent('finding-refuter'),
]

// The shipped entry workflow of the framework plugin: phases and what the engine starts.
const pipeline = (overrides = {}) => ({
  path: 'plugins/framework/workflows/pipeline.skraft.dot',
  pluginDir: 'framework',
  entry: true,
  phases: [{ phase: 'RESEARCH', specialist: 'researcher' }],
  agents: ['researcher', 'consistency-lens', 'finding-refuter'],
  ...overrides,
})

const build = (agents = validAgents(), extra = {}) => buildCatalogueTopology({ skills: [skill('research-skill')], agents, pipelines: [pipeline()], ...extra })

describe('catalogue topology', () => {
  it('reads phases from the entry workflow and its entrypoint from the plugin that ships it', () => {
    const topology = build()

    deepStrictEqual(topology.findings, [])
    deepStrictEqual(topology.roots, ['backlog-discoverer', 'backlog-planner', 'skraft-orchestrator'])
    deepStrictEqual(topology.journeys.engineering, { entrypoint: 'skraft-orchestrator', phases: [{ phase: 'RESEARCH', specialist: 'researcher', reviewer: null }] })
    const researcher = topology.agents.find(({ id }) => id === 'researcher')
    deepStrictEqual([researcher.phase, researcher.dispatchedBy, researcher.layer, researcher.skills], ['RESEARCH', 'skraft-orchestrator', 'engineering-pipeline', ['research-skill']])
    deepStrictEqual(topology.edges.find((edge) => edge.to === 'researcher'), { type: 'dispatch', from: 'skraft-orchestrator', to: 'researcher', sources: ['workflow'] })
  })

  it('names the engine as the dispatcher of the lenses and the refuter a workflow names', () => {
    const topology = build()
    deepStrictEqual(['consistency-lens', 'finding-refuter'].map((id) => topology.agents.find((a) => a.id === id).dispatchedBy), [ENGINE_DISPATCHER, ENGINE_DISPATCHER])
  })

  it('resolves a child a parent lists by its display label and keeps that edge', () => {
    const agents = validAgents()
    agents[2].childRefs.push('Display label impossible to derive')
    const topology = build(agents)
    deepStrictEqual(topology.edges.find((edge) => edge.to === 'researcher').sources, ['agents'])
    equal(topology.findings.length, 0)
  })

  it('reports duplicate identities, unknown children and a phase agent no descriptor declares', () => {
    const agents = validAgents()
    agents.push(agent('researcher', { name: 'Duplicate ID' }))
    agents[2].childRefs.push('Missing child')
    const codes = build(agents, { pipelines: [pipeline({ phases: [{ phase: 'RESEARCH', specialist: 'missing-researcher' }] })] }).findings.map(({ code }) => code)

    ok(codes.includes('AGENT_ID_DUPLICATE'))
    ok(codes.includes('DISPATCH_TARGET_MISSING'))
    ok(codes.includes('PHASE_SPECIALIST_MISSING'))
  })

  it('reports an entry workflow without one user-invocable agent in its plugin, and two entry workflows', () => {
    const two = validAgents()
    two.push(agent('other-entry', { userInvocable: true }))
    ok(build(two).findings.some(({ code }) => code === 'ENGINEERING_ORCHESTRATOR_AMBIGUOUS'))
    ok(build(validAgents().filter(({ id }) => id !== 'skraft-orchestrator')).findings.some(({ code }) => code === 'ENGINEERING_ORCHESTRATOR_MISSING'))
    ok(build(validAgents(), { pipelines: [pipeline(), pipeline({ path: 'plugins/other/workflows/pipeline.skraft.dot', pluginDir: 'other' })] }).findings.some(({ code }) => code === 'ENGINEERING_WORKFLOW_AMBIGUOUS'))
  })

  it('blocks product preflight agents dispatched inside engineering', () => {
    const agents = validAgents()
    agents[2].childRefs.unshift('Discovery entry')

    const topology = build(agents)

    ok(topology.findings.some(({ code }) => code === 'PRODUCT_PREFLIGHT_NOT_STANDALONE'))
    ok(topology.findings.some(({ code }) => code === 'PRODUCT_PREFLIGHT_ORCHESTRATED'))
  })

  it('gives an internal agent nothing else dispatches to its plugin\'s one dynamic workflow, and reports one whose plugin has none', () => {
    const agents = [
      ...validAgents(),
      agent('slicer', { plugin: 'backlog' }),
      agent('writer', { plugin: 'backlog' }),
      agent('stray', { plugin: 'brownfield' }),
    ]
    const workflows = [{ id: 'prd-workflow', plugin: 'backlog', path: 'plugins/backlog/com.github.copilot/extensions/prd-workflow/copilot-extension.json' }]

    const topology = build(agents, { workflows })

    deepStrictEqual(topology.findings.filter(({ code }) => code === 'AGENT_DISPATCHER_UNKNOWN').map(({ path }) => path), ['plugins/brownfield/com.github.copilot/agents/stray.agent.md'])
    deepStrictEqual(['slicer', 'writer'].map((id) => topology.agents.find((a) => a.id === id).dispatchedBy), ['prd-workflow', 'prd-workflow'])
    equal(topology.agents.find((a) => a.id === 'stray').dispatchedBy, null)
  })
})
