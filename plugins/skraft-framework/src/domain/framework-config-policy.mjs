// Pure policy: turn a set of agent descriptors into the deterministic guardrail
// configuration the hooks consume. No IO, no YAML, no filesystem — the input is
// already-parsed descriptors, the output is a frozen plain object.
//
// A descriptor is: { id?, name, phase?, dispatchedBy?, phases?, skills[],
// onDemandSkills[], inputs[], context[], outputs[] }.
// Only the orchestrator carries `phases` (the pipeline order); pipeline specialists
// and reviewers carry `phase` and are `dispatchedBy: <the orchestrator's own name>`.

export const DEFAULT_SKILL_POLICY = 'verify'
// A skill the agent loads only at the step that needs it: never injected at start,
// never required at stop, still traced when read.
export const ON_DEMAND_SKILL_POLICY = 'on-demand'

// A reviewer's name ends with the word "Reviewer", separated by a hyphen (legacy
// kebab-case, e.g. `solution-architect-reviewer`) or whitespace (display-style
// names, e.g. `Skraft - Solution Architect Reviewer`). Case-insensitive so either
// naming convention is recognized without a migration step.
const isReviewer = (name) => /(?:^|[\s-])reviewer$/i.test((name ?? '').trim())

// A reviewer may declare its phase as `{PHASE}-REVIEW`; it still belongs to {PHASE}.
const REVIEW_SUFFIX = '-REVIEW'
const basePhase = (phase) =>
  phase.endsWith(REVIEW_SUFFIX) ? phase.slice(0, -REVIEW_SUFFIX.length) : phase

const deepFreeze = (value) => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

// The phase order is whatever the orchestrator declares — single source of truth.
// The orchestrator is identified structurally (it's the descriptor that declares
// `phases`), never by a hardcoded name literal — so renaming it requires no change here.
const orchestratorOf = (descriptors) => descriptors.find((d) => Array.isArray(d.phases) && d.phases.length > 0)

const phaseOrderOf = (descriptors) => {
  const orchestrator = orchestratorOf(descriptors)
  return orchestrator ? [...orchestrator.phases] : []
}

// For each phase, pick the one orchestrator-dispatched specialist and its reviewer.
const phaseAgentsOf = (descriptors, phaseOrder) => {
  const orchestrator = orchestratorOf(descriptors)
  const pipeline = orchestrator
    ? descriptors.filter((d) => d.dispatchedBy === orchestrator.name && d.phase)
    : []
  return Object.fromEntries(
    phaseOrder.map((phase) => {
      const inPhase = pipeline.filter((d) => basePhase(d.phase) === phase)
      return [
        phase,
        {
          specialist: inPhase.find((d) => !isReviewer(d.name))?.name ?? null,
          reviewer: inPhase.find((d) => isReviewer(d.name))?.name ?? null,
        },
      ]
    }),
  )
}

const skillsWithPolicy = (skills, onDemandSkills) => [
  ...skills.map((name) => ({ name, policy: DEFAULT_SKILL_POLICY })),
  ...onDemandSkills.map((name) => ({ name, policy: ON_DEMAND_SKILL_POLICY })),
]

// Every agent's skills, in declaration order: its `skills` under the verification
// policy, then its `on_demand_skills` under the on-demand policy.
const agentSkillsOf = (descriptors) =>
  Object.fromEntries(descriptors.map((d) => [d.name, skillsWithPolicy(d.skills ?? [], d.onDemandSkills ?? [])]))

// The two skill lists are disjoint: a skill is either mandatory or on-demand, never
// both. Returns a frozen list of violations (empty = valid) for config:check.
export const validateSkillDeclarations = (descriptors) => Object.freeze(
  descriptors.flatMap((d) => {
    const mandatory = new Set(d.skills ?? [])
    return (d.onDemandSkills ?? [])
      .filter((name) => mandatory.has(name))
      .map((name) => ({
        agent: d.name,
        code: 'SKILL_DECLARED_TWICE',
        message: `'${name}' is listed under both skills and on_demand_skills; keep it in one list`,
      }))
  }),
)

// Every agent's expected artifacts: its required inputs and its produced outputs.
const agentArtifactsOf = (descriptors) =>
  Object.fromEntries(
    descriptors.map((d) => [d.name, { inputs: [...(d.inputs ?? [])], outputs: [...(d.outputs ?? [])] }]),
  )

// Every agent's context inputs: what it consults when a step needs it, handed over
// at dispatch next to its required inputs (state.mjs handoff).
const agentContextOf = (descriptors) =>
  Object.fromEntries(descriptors.map((d) => [d.name, [...(d.context ?? [])]]))

// Harnesses disagree on the identifier surfaced by SubagentStart: display name,
// filename id, or a plugin-prefixed id. Keep one deterministic map to the display name
// used by all generated policy sections.
const agentAliasesOf = (descriptors) => Object.fromEntries(
  descriptors.flatMap((descriptor) => [
    ...(descriptor.id ? [[descriptor.id, descriptor.name]] : []),
    [descriptor.name, descriptor.name],
  ]),
)

// Who dispatches each agent, by display name (dispatched_by may name an id).
const agentDispatchersOf = (descriptors, aliases) => Object.fromEntries(
  descriptors
    .filter((descriptor) => typeof descriptor.dispatchedBy === 'string' && descriptor.dispatchedBy.length > 0)
    .map((descriptor) => [descriptor.name, aliases[descriptor.dispatchedBy] ?? descriptor.dispatchedBy]),
)

export const buildFrameworkConfig = (descriptors) => {
  const phaseOrder = phaseOrderOf(descriptors)
  const agentAliases = agentAliasesOf(descriptors)
  return deepFreeze({
    phaseOrder,
    phaseAgents: phaseAgentsOf(descriptors, phaseOrder),
    agentAliases,
    agentDispatchers: agentDispatchersOf(descriptors, agentAliases),
    agentSkills: agentSkillsOf(descriptors),
    agentArtifacts: agentArtifactsOf(descriptors),
    agentContext: agentContextOf(descriptors),
  })
}
