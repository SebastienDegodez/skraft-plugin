// Pure policy: the structural PRESENCE invariant of the dispatch graph, validated
// from already-parsed descriptors. No IO. Returns a frozen list of violations
// (empty = valid) so the generator can fail config:check on bad agent data.
//
// Invariant (presence): every agent is a root or declares its dispatcher.
//   - a root is an entry-point a person invokes; nothing dispatches it, it declares no parent;
//   - every other agent is dispatched by exactly one parent, so it MUST declare one.
//
// MULTIPLE ROOTS are supported. The dispatch graph is a FOREST, not a single tree.
// A root is a user-invocable agent nothing dispatches (the pipeline launcher
// `skraft-orchestrator`, `brownfield-analyst`, the backlog agents…): it declares no
// parent. The engineering phase agents are dispatched by the pipeline itself, which runs
// as code: they declare `dispatched_by: skraft-pipeline` (pipeline/pipeline-definition.mjs).
// A pipeline specialist that is ALSO user-invocable still declares `dispatched_by`, so it
// is a dispatched child; `user-invocable: true` alone is not the root signal — having no
// parent is.
//
// The phase order is declared in code, never by an agent: `metadata.phases` on a
// descriptor is refused (PHASES_IN_AGENT), so no agent can drift from the order the
// pipeline runs.
//
// This guards the data the config is built from: phaseAgents is derived from
// dispatched_by, so an orphan or a mis-parented root would silently distort it.

const hasParent = (descriptor) =>
  typeof descriptor.dispatchedBy === 'string' && descriptor.dispatchedBy.trim() !== ''

const declaresPhases = (descriptor) => Array.isArray(descriptor.phases) && descriptor.phases.length > 0

// A root: user-invocable, outside the pipeline's phases (no phase), no parent.
export const isRoot = (descriptor) =>
  descriptor.userInvocable === true && !descriptor.phase && !hasParent(descriptor)

const violation = (agent, code, message) => ({ agent, code, message })

export const validateDispatch = (descriptors) => {
  const violations = []
  for (const descriptor of descriptors) {
    if (declaresPhases(descriptor)) {
      violations.push(violation(descriptor.name, 'PHASES_IN_AGENT', 'the phase order is declared in code (domain/pipeline/pipeline-definition.mjs); remove metadata.phases'))
    }
    if (!isRoot(descriptor) && !hasParent(descriptor)) {
      violations.push(violation(descriptor.name, 'ORPHAN_AGENT', 'a non-root agent must declare dispatched_by'))
    }
  }
  return Object.freeze(violations)
}
