// Pure policy: the structural PRESENCE invariant of the dispatch graph, validated
// from already-parsed descriptors. No IO. Returns a frozen list of violations
// (empty = valid) so the generator can fail config:check on bad agent data.
//
// Invariant (presence): is_root XOR has(dispatched_by).
//   - a root is an entry-point; nothing dispatches it, so it must NOT declare a parent;
//   - every other agent is dispatched by exactly one parent, so it MUST declare one.
//
// MULTIPLE ROOTS are supported. The dispatch graph is a FOREST, not a single tree:
//   - the PHASE ROOT (`skraft-orchestrator`) declares the pipeline phase order
//     (`metadata.phases`, non-empty) — the single entry-point for the SDLC pipeline;
//   - a STANDALONE ROOT is an independent, user-invocable workflow that does not
//     belong to the pipeline at all (no `metadata.phase`, no `metadata.phases`) and
//     is invoked directly by the human (e.g. `brownfield-analyst`). It is its own
//     entry-point and must likewise declare no parent.
// A pipeline specialist that is ALSO user-invocable (e.g. `backlog-discoverer`) is
// NOT a standalone root: it still declares `metadata.phase` and `dispatched_by`, so
// it is correctly classified as a dispatched child. `user-invocable: true` alone is
// not the standalone signal — the ABSENCE of any pipeline membership is.
//
// This guards the data that G1 (phase-order dispatch guard) relies on: phaseAgents
// is derived from dispatched_by, so an orphan or a mis-parented root would silently
// distort the guard. The dispatch MODE (required/conditional) is deliberately out
// of scope until a runtime hook is proven to consume a dispatch tree.

const hasParent = (descriptor) =>
  typeof descriptor.dispatchedBy === 'string' && descriptor.dispatchedBy.trim() !== ''

const hasPhases = (descriptor) => Array.isArray(descriptor.phases) && descriptor.phases.length > 0

// The phase root declares the pipeline's phase order.
const isPhaseRoot = (descriptor) => hasPhases(descriptor)

// A standalone root: user-invocable, outside the pipeline (no phase/phases), no parent.
const isStandaloneRoot = (descriptor) =>
  descriptor.userInvocable === true && !hasPhases(descriptor) && !descriptor.phase && !hasParent(descriptor)

export const isRoot = (descriptor) => isPhaseRoot(descriptor) || isStandaloneRoot(descriptor)

const violation = (agent, code, message) => ({ agent, code, message })

export const validateDispatch = (descriptors) => {
  const violations = []
  for (const descriptor of descriptors) {
    if (isRoot(descriptor) && hasParent(descriptor)) {
      violations.push(violation(descriptor.name, 'ROOT_WITH_PARENT', 'the root agent must not declare dispatched_by'))
    } else if (!isRoot(descriptor) && !hasParent(descriptor)) {
      violations.push(violation(descriptor.name, 'ORPHAN_AGENT', 'a non-root agent must declare dispatched_by'))
    }
  }
  return Object.freeze(violations)
}
