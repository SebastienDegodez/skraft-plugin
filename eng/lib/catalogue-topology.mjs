// Pure catalogue topology builder.
//
// Callers own filesystem parsing. This module resolves stable identities,
// dispatch relationships, source layers and the two published usage journeys
// without IO or timestamps, so scanners, dashboard builders and tests share
// one deterministic contract.

const asArray = (value) => (Array.isArray(value) ? value : value == null || value === '' ? [] : [value])
const basePhase = (phase) => String(phase ?? '').replace(/-REVIEW$/, '')
const isReviewer = (agent) => String(agent.phase ?? '').endsWith('-REVIEW') || /(?:^|[\s-])reviewer$/i.test(String(agent.name ?? '').trim())
const byId = (left, right) => left.id.localeCompare(right.id)

const unique = (values) => [...new Set(values)]

const legacyFamily = (kind) => ({ agent: 'agents', worker: 'workers', lens: 'lenses' })[kind]

const finding = (severity, code, path, message) => ({ severity, code, path, message })

export const buildCatalogueTopology = ({ skills = [], agents = [], frameworkConfig = null } = {}) => {
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

  const orchestrators = agents.filter((agent) => agent.phases.length > 0)
  if (orchestrators.length > 1) {
    findings.push(finding('error', 'ENGINEERING_ORCHESTRATOR_AMBIGUOUS', orchestrators.map((agent) => agent.path).join(', '), 'More than one agent declares an ordered phase list'))
  }
  const orchestrator = orchestrators.length === 1 ? orchestrators[0] : null
  const phaseOrder = orchestrator?.phases ?? []

  if (orchestrator && frameworkConfig) {
    const configured = frameworkConfig.phaseOrder ?? []
    if (JSON.stringify(configured) !== JSON.stringify(phaseOrder)) {
      findings.push(finding('error', 'ENGINEERING_PHASE_ORDER_MISMATCH', orchestrator.path, `Descriptor phases ${phaseOrder.join(' -> ')} do not match generated config ${configured.join(' -> ')}`))
    }
  }

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
      const declaredParent = child.dispatchedByRef ? resolveAgent(child.dispatchedByRef) : null
      if (declaredParent && declaredParent.id !== parent.id) {
        findings.push(finding('error', 'DISPATCH_PARENT_CONFLICT', child.path, `${child.name} declares '${child.dispatchedByRef}' but is listed by '${parent.name}'`))
      }
      const edge = dispatchEdges.get(`${parent.id}:${child.id}`)
      dispatchEdges.set(`${parent.id}:${child.id}`, { ...edge, order })
    }
  }

  for (const child of agents) {
    if (!child.dispatchedByRef) continue
    const parent = resolveAgent(child.dispatchedByRef)
    if (!parent) {
      findings.push(finding('error', 'DISPATCH_PARENT_MISSING', child.path, `${child.name} declares unknown dispatcher '${child.dispatchedByRef}'`))
      continue
    }
    addDispatchEdge(parent.id, child.id, 'dispatched_by')
  }

  const incoming = new Map()
  for (const edge of dispatchEdges.values()) incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from])

  const phaseAgents = {}
  if (orchestrator) {
    for (const phase of phaseOrder) {
      const candidates = agents.filter((agent) =>
        agent.id !== orchestrator.id &&
        basePhase(agent.phase) === phase &&
        dispatchEdges.has(`${orchestrator.id}:${agent.id}`),
      )
      const specialist = candidates.find((agent) => !isReviewer(agent)) ?? null
      const reviewer = candidates.find((agent) => isReviewer(agent)) ?? null
      if (!specialist) {
        findings.push(finding('error', 'PHASE_SPECIALIST_MISSING', orchestrator.path, `Engineering phase '${phase}' has no dispatched specialist`))
      }
      phaseAgents[phase] = { specialist: specialist?.id ?? null, reviewer: reviewer?.id ?? null }
    }
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
    const isEngineering = agent.id === orchestrator?.id || phaseOrder.includes(basePhase(agent.phase))
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
      dispatchedBy: agent.dispatchedByRef ? resolveAgent(agent.dispatchedByRef)?.id ?? null : null,
      artifacts: { inputs: agent.inputs, outputs: agent.outputs },
      legacyRoutes: family ? ['fr', 'en'].map((lang) => `/${lang}/reference/${family}/${agent.id}/`) : [],
    }
  }).sort(byId)

  const enrichedById = new Map(enrichedAgents.map((agent) => [agent.id, agent]))
  const backlogDiscoverer = enrichedById.get('backlog-discoverer')
  const backlogPlanner = enrichedById.get('backlog-planner')
  if (!backlogDiscoverer) findings.push(finding('error', 'PRODUCT_PREFLIGHT_AGENT_MISSING', 'plugins/skraft-framework/agents', "Required product preflight agent 'backlog-discoverer' is missing"))
  if (!backlogPlanner) findings.push(finding('error', 'PRODUCT_PREFLIGHT_AGENT_MISSING', 'plugins/skraft-framework/agents', "Required product preflight agent 'backlog-planner' is missing"))
  if (!orchestrator) findings.push(finding('error', 'ENGINEERING_ORCHESTRATOR_MISSING', 'plugins/skraft-framework/agents', 'No agent declares the engineering phase order'))
  for (const agent of [backlogDiscoverer, backlogPlanner].filter(Boolean)) {
    if (!agent.userInvocable || !agent.root) {
      findings.push(finding('error', 'PRODUCT_PREFLIGHT_NOT_STANDALONE', agent.path, `${agent.name} must be a directly invocable root`))
    }
    if (orchestrator && agent.parents.includes(orchestrator.id)) {
      findings.push(finding('error', 'PRODUCT_PREFLIGHT_ORCHESTRATED', agent.path, `${agent.name} must run before, not inside, the engineering orchestrator`))
    }
  }

  if (frameworkConfig) {
    for (const [phase, configured] of Object.entries(frameworkConfig.phaseAgents ?? {})) {
      const expected = phaseAgents[phase]
      const configuredSpecialist = configured?.specialist ? resolveAgent(configured.specialist)?.id ?? configured.specialist : null
      const configuredReviewer = configured?.reviewer ? resolveAgent(configured.reviewer)?.id ?? configured.reviewer : null
      if (!expected || expected.specialist !== configuredSpecialist || expected.reviewer !== configuredReviewer) {
        findings.push(finding('error', 'ENGINEERING_PHASE_AGENT_MISMATCH', orchestrator?.path ?? 'plugins/skraft-framework/agents', `Generated config for '${phase}' does not match descriptor dispatch topology`))
      }
    }

    for (const agent of enrichedAgents) {
      const configuredSkills = frameworkConfig.agentSkills?.[agent.name] ?? frameworkConfig.agentSkills?.[agent.id]
      if (configuredSkills) {
        const names = configuredSkills.map((skill) => typeof skill === 'string' ? skill : skill.name)
        if (JSON.stringify(names) !== JSON.stringify(agent.skills)) {
          findings.push(finding('error', 'AGENT_SKILLS_CONFIG_MISMATCH', agent.path, `Generated skill order for '${agent.name}' does not match its descriptor`))
        }
      }
      const configuredArtifacts = frameworkConfig.agentArtifacts?.[agent.name] ?? frameworkConfig.agentArtifacts?.[agent.id]
      if (configuredArtifacts && JSON.stringify(configuredArtifacts) !== JSON.stringify(agent.artifacts)) {
        findings.push(finding('error', 'AGENT_ARTIFACTS_CONFIG_MISMATCH', agent.path, `Generated artifacts for '${agent.name}' do not match its descriptor`))
      }
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
