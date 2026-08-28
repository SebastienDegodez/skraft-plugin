// Pure policy: turn a set of agent descriptors into the deterministic guardrail
// configuration the hooks consume. No IO, no YAML, no filesystem — the input is
// already-parsed descriptors, the output is a frozen plain object.
//
// A descriptor is: { id?, name, phase?, dispatchedBy?, phases?, skills[],
// instructions[], inputs[], outputs[] }.
// Only the orchestrator carries `phases` (the pipeline order); pipeline specialists
// and reviewers carry `phase` and are `dispatchedBy: <the orchestrator's own name>`.

export const DEFAULT_SKILL_POLICY = 'verify'

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

const skillsWithPolicy = (skills) => skills.map((name) => ({ name, policy: DEFAULT_SKILL_POLICY }))

// Every agent's enforceable skills, defaulted to the verification policy.
const agentSkillsOf = (descriptors) =>
  Object.fromEntries(descriptors.map((d) => [d.name, skillsWithPolicy(d.skills ?? [])]))

// Every agent's expected artifacts: its required inputs and its produced outputs.
const agentArtifactsOf = (descriptors) =>
  Object.fromEntries(
    descriptors.map((d) => [d.name, { inputs: [...(d.inputs ?? [])], outputs: [...(d.outputs ?? [])] }]),
  )

// Harnesses disagree on the identifier surfaced by SubagentStart: display name,
// filename id, or a plugin-prefixed id. Keep one deterministic map to the display name
// used by all generated policy sections.
const agentAliasesOf = (descriptors) => Object.fromEntries(
  descriptors.flatMap((descriptor) => [
    ...(descriptor.id ? [[descriptor.id, descriptor.name]] : []),
    [descriptor.name, descriptor.name],
  ]),
)

const agentInstructionsOf = (descriptors) => Object.fromEntries(
  descriptors.map((descriptor) => [descriptor.name, [...(descriptor.instructions ?? [])]]),
)

export const buildFrameworkConfig = (descriptors) => {
  const phaseOrder = phaseOrderOf(descriptors)
  return deepFreeze({
    phaseOrder,
    phaseAgents: phaseAgentsOf(descriptors, phaseOrder),
    agentAliases: agentAliasesOf(descriptors),
    agentSkills: agentSkillsOf(descriptors),
    agentInstructions: agentInstructionsOf(descriptors),
    agentArtifacts: agentArtifactsOf(descriptors),
  })
}
