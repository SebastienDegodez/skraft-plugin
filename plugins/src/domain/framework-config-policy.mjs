// Pure policy: turn a set of agent descriptors into the deterministic guardrail
// configuration the hooks consume. No IO, no YAML, no filesystem — the input is
// already-parsed descriptors, the output is a frozen plain object.
//
// A descriptor is: { name, phase?, dispatchedBy?, phases?, skills[], inputs[], outputs[] }.
// Only the orchestrator carries `phases` (the pipeline order); pipeline specialists
// and reviewers carry `phase` and are `dispatchedBy: skraft-orchestrator`.

export const DEFAULT_SKILL_POLICY = 'verify'

const ORCHESTRATOR = 'skraft-orchestrator'
const isReviewer = (name) => name.endsWith('-reviewer')

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
const phaseOrderOf = (descriptors) => {
  const orchestrator = descriptors.find((d) => Array.isArray(d.phases) && d.phases.length > 0)
  return orchestrator ? [...orchestrator.phases] : []
}

// For each phase, pick the one orchestrator-dispatched specialist and its reviewer.
const phaseAgentsOf = (descriptors, phaseOrder) => {
  const pipeline = descriptors.filter((d) => d.dispatchedBy === ORCHESTRATOR && d.phase)
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

export const buildFrameworkConfig = (descriptors) => {
  const phaseOrder = phaseOrderOf(descriptors)
  return deepFreeze({
    phaseOrder,
    phaseAgents: phaseAgentsOf(descriptors, phaseOrder),
    agentSkills: agentSkillsOf(descriptors),
    agentArtifacts: agentArtifactsOf(descriptors),
  })
}
