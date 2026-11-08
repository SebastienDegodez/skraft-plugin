// Pure catalogue topology builder.
//
// Callers own filesystem parsing. This module resolves stable identities,
// dispatch relationships, source layers and the two published usage journeys
// without IO or timestamps, so scanners, dashboard builders and tests share
// one deterministic contract.

/** The plugin folder a repository path sits in, `plugins/<dir>/…`, else null. @param {string} path */
const pluginDirOf = (path) => /^plugins\/([^/]+)\//.exec(String(path).split('\\').join('/'))?.[1] ?? null

const byId = (left, right) => left.id.localeCompare(right.id)

const unique = (values) => [...new Set(values)]

const legacyFamily = (kind) => ({ agent: 'agents', worker: 'workers', lens: 'lenses' })[kind]

const finding = (severity, code, path, message) => ({ severity, code, path, message })

// The V2 engine starts what a shipped workflow names apart from its phase agents: the review
// lenses, the finding refuter.
export const ENGINE_DISPATCHER = 'skraft-engine'

// Who dispatches an agent is no descriptor field: a parent lists it under `agents:`; a plugin's
// entry workflow (eng/lib/shipped-workflows.mjs) dispatches its phase agents from the plugin's one
// user-invocable agent, and the engine starts the lenses and the refuter that workflow names; any
// other internal agent belongs to its plugin's one dynamic workflow (copilot-extension.json `name`).
export const buildCatalogueTopology = ({ skills = [], agents = [], workflows = [], pipelines = [] } = {}) => {
  const findings = []
  const skillIds = new Set(skills.map((skill) => skill.directory))
  const idGroups = new Map()
  const nameGroups = new Map()

  for (const agent of agents) {
    idGroups.set(agent.id, [...(idGroups.get(agent.id) ?? []), agent])
    nameGroups.set(agent.name, [...(nameGroups.get(agent.name) ?? []), agent])
  }

  for (const [id, matches] of idGroups) {
    if (matches.length > 1) {
      findings.push(finding('error', 'AGENT_ID_DUPLICATE', matches.map((agent) => agent.path).join(', '), `Stable agent id '${id}' is declared by ${matches.length} files`))
    }
  }
  for (const [name, matches] of nameGroups) {
    if (matches.length > 1) {
      findings.push(finding('error', 'AGENT_NAME_DUPLICATE', matches.map((agent) => agent.path).join(', '), `Agent display name '${name}' is ambiguous`))
    }
  }

  const agentById = new Map([...idGroups].filter(([, matches]) => matches.length === 1).map(([id, matches]) => [id, matches[0]]))
  const agentByName = new Map([...nameGroups].filter(([, matches]) => matches.length === 1).map(([name, matches]) => [name, matches[0]]))
  const resolveAgent = (reference) => agentByName.get(String(reference)) ?? agentById.get(String(reference)) ?? null

  const entries = pipelines.filter((pipeline) => pipeline.entry)
  if (entries.length > 1) {
    findings.push(finding('error', 'ENGINEERING_WORKFLOW_AMBIGUOUS', entries.map((pipeline) => pipeline.path).join(', '), 'More than one plugin ships an entry workflow'))
  }
  const pipeline = entries.length === 1 ? entries[0] : null
  const entrypoints = pipeline ? agents.filter((agent) => agent.kind === 'agent' && agent.userInvocable && pluginDirOf(agent.path) === pipeline.pluginDir) : []
  if (entrypoints.length > 1) {
    findings.push(finding('error', 'ENGINEERING_ORCHESTRATOR_AMBIGUOUS', entrypoints.map((agent) => agent.path).join(', '), 'The plugin that ships the entry workflow has more than one user-invocable agent'))
  }
  const orchestrator = entrypoints.length === 1 ? entrypoints[0] : null
  const phaseOrder = pipeline ? pipeline.phases.map(({ phase }) => phase) : []
  const specialists = new Map(pipeline ? pipeline.phases.flatMap(({ phase, specialist }) => {
    const agent = resolveAgent(specialist)
    return agent ? [[agent.id, phase]] : []
  }) : [])
  const engineStarted = new Set(pipelines.flatMap((shipped) => shipped.agents))

  const dispatchEdges = new Map()
  const addDispatchEdge = (from, to, source) => {
    const key = `${from}:${to}`
    const previous = dispatchEdges.get(key)
    dispatchEdges.set(key, {
      ...previous,
      type: 'dispatch',
      from,
      to,
      sources: unique([...(previous?.sources ?? []), source]),
    })
  }

  for (const parent of agents) {
    for (const [order, reference] of parent.childRefs.entries()) {
      const child = resolveAgent(reference)
      if (!child) {
        findings.push(finding('error', 'DISPATCH_TARGET_MISSING', parent.path, `${parent.name} references unknown child '${reference}'`))
        continue
      }
      addDispatchEdge(parent.id, child.id, 'agents')
      const edge = dispatchEdges.get(`${parent.id}:${child.id}`)
      dispatchEdges.set(`${parent.id}:${child.id}`, { ...edge, order })
    }
  }

  const listed = new Set([...dispatchEdges.values()].map((edge) => edge.to))
  const dispatcherOf = new Map()
  for (const child of agents) {
    if (listed.has(child.id)) continue
    if (orchestrator && specialists.has(child.id)) {
      addDispatchEdge(orchestrator.id, child.id, 'workflow')
      continue
    }
    if (engineStarted.has(child.id)) {
      dispatcherOf.set(child.id, ENGINE_DISPATCHER)
      continue
    }
    if (child.userInvocable) continue
    const own = workflows.filter((workflow) => pluginDirOf(workflow.path) === pluginDirOf(child.path))
    if (own.length === 1) dispatcherOf.set(child.id, own[0].id)
    else findings.push(finding('error', 'AGENT_DISPATCHER_UNKNOWN', child.path, `${child.name} is internal, yet no agent lists it, no shipped workflow names it and its plugin has ${own.length ? 'several dynamic workflows' : 'no dynamic workflow'}`))
  }

  const incoming = new Map()
  for (const edge of dispatchEdges.values()) incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from])

  const phaseAgents = {}
  for (const { phase, specialist } of pipeline?.phases ?? []) {
    const agent = resolveAgent(specialist)
    if (!agent) findings.push(finding('error', 'PHASE_SPECIALIST_MISSING', pipeline.path, `Engineering phase '${phase}' dispatches unknown agent '${specialist}'`))
    phaseAgents[phase] = { specialist: agent?.id ?? null, reviewer: null }
  }

  const enrichedSkills = skills.map((skill) => ({
    ...skill,
    id: skill.directory,
    anchor: `skill-${skill.directory}`,
    legacyRoutes: ['fr', 'en'].map((lang) => `/${lang}/reference/skills/${skill.directory}/`),
  })).sort(byId)

  const enrichedAgents = agents.map((agent) => {
    const children = [...dispatchEdges.values()].filter((edge) => edge.from === agent.id).sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || left.to.localeCompare(right.to)).map((edge) => edge.to)
    const parents = incoming.get(agent.id) ?? []
    const isProduct = agent.id === 'backlog-discoverer' || agent.id === 'backlog-planner'
    const isEngineering = agent.id === orchestrator?.id || specialists.has(agent.id)
    const layer = isProduct ? 'product-preflight' : isEngineering ? 'engineering-pipeline' : agent.kind === 'agent' ? 'standalone' : 'internal'
    const family = legacyFamily(agent.kind)

    for (const skill of agent.skills) {
      if (!skillIds.has(skill)) findings.push(finding('warning', 'AGENT_SKILL_MISSING', agent.path, `${agent.name} references unknown skill '${skill}'`))
    }

    return {
      ...agent,
      anchor: `${agent.kind}-${agent.id}`,
      layer,
      optional: isProduct,
      root: agent.userInvocable && parents.length === 0,
      parents: unique(parents),
      children,
      phase: specialists.get(agent.id) ?? null,
      dispatchedBy: dispatcherOf.get(agent.id) ?? (parents.length === 1 ? parents[0] : null),
      legacyRoutes: family ? ['fr', 'en'].map((lang) => `/${lang}/reference/${family}/${agent.id}/`) : [],
    }
  }).sort(byId)

  const enrichedById = new Map(enrichedAgents.map((agent) => [agent.id, agent]))
  const backlogDiscoverer = enrichedById.get('backlog-discoverer')
  const backlogPlanner = enrichedById.get('backlog-planner')
  if (!backlogDiscoverer) findings.push(finding('error', 'PRODUCT_PREFLIGHT_AGENT_MISSING', 'plugins/skraft-backlog/com.github.copilot/agents', "Required product preflight agent 'backlog-discoverer' is missing"))
  if (!backlogPlanner) findings.push(finding('error', 'PRODUCT_PREFLIGHT_AGENT_MISSING', 'plugins/skraft-backlog/com.github.copilot/agents', "Required product preflight agent 'backlog-planner' is missing"))
  if (!orchestrator) findings.push(finding('error', 'ENGINEERING_ORCHESTRATOR_MISSING', pipeline?.path ?? 'plugins', pipeline ? 'The plugin that ships the entry workflow has no user-invocable agent to start it' : 'No plugin ships an entry workflow'))
  for (const agent of [backlogDiscoverer, backlogPlanner].filter(Boolean)) {
    if (!agent.userInvocable || !agent.root) {
      findings.push(finding('error', 'PRODUCT_PREFLIGHT_NOT_STANDALONE', agent.path, `${agent.name} must be a directly invocable root`))
    }
    if (orchestrator && agent.parents.includes(orchestrator.id)) {
      findings.push(finding('error', 'PRODUCT_PREFLIGHT_ORCHESTRATED', agent.path, `${agent.name} must run before, not inside, the engineering orchestrator`))
    }
  }

  const productSteps = [
    backlogDiscoverer && { agent: backlogDiscoverer.id, optional: true, requires: null },
    backlogPlanner && { agent: backlogPlanner.id, optional: true, requires: 'triage-or-upstream-handoff', after: backlogDiscoverer?.id ?? null },
    orchestrator && { agent: orchestrator.id, optional: false, requires: 'refined-story' },
  ].filter(Boolean)

  const edges = [
    ...[...dispatchEdges.values()].sort((left, right) => left.from.localeCompare(right.from) || (left.order ?? 0) - (right.order ?? 0) || left.to.localeCompare(right.to)),
    ...enrichedAgents.flatMap((agent) => agent.skills.filter((skill) => skillIds.has(skill)).map((skill, order) => ({ type: 'uses-skill', from: agent.id, to: skill, order }))),
    ...(backlogDiscoverer && backlogPlanner ? [{ type: 'precedes', from: backlogDiscoverer.id, to: backlogPlanner.id, condition: 'when-both-used' }] : []),
    ...(backlogPlanner && orchestrator ? [{ type: 'precedes', from: backlogPlanner.id, to: orchestrator.id, condition: 'after-refinement' }] : []),
  ]

  return {
    schemaVersion: 1,
    skills: enrichedSkills,
    agents: enrichedAgents,
    roots: enrichedAgents.filter((agent) => agent.root).map((agent) => agent.id),
    edges,
    journeys: {
      productToEngineering: {
        id: 'product-to-engineering',
        steps: productSteps,
        variants: [
          orchestrator && [orchestrator.id],
          backlogPlanner && orchestrator && [backlogPlanner.id, orchestrator.id],
          backlogDiscoverer && backlogPlanner && orchestrator && [backlogDiscoverer.id, backlogPlanner.id, orchestrator.id],
        ].filter(Boolean),
      },
      engineering: {
        entrypoint: orchestrator?.id ?? null,
        phases: phaseOrder.map((phase) => ({ phase, ...phaseAgents[phase] })),
      },
    },
    findings,
  }
}
