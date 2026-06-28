// Pure policy: the structural PRESENCE invariant of the dispatch graph, validated
// from already-parsed descriptors. No IO. Returns a frozen list of violations
// (empty = valid) so the generator can fail config:check on bad agent data.
//
// Invariant (presence): is_root XOR has(dispatched_by).
//   - the root is the single entry-point (it declares the phase order); nothing
//     dispatches it, so it must NOT declare a parent;
//   - every other agent is dispatched by exactly one parent, so it MUST declare one.
//
// This guards the data that G1 (phase-order dispatch guard) relies on: phaseAgents
// is derived from dispatched_by, so an orphan or a mis-parented root would silently
// distort the guard. The dispatch MODE (required/conditional) is deliberately out
// of scope until a runtime hook is proven to consume a dispatch tree.

// The root declares a non-empty phase order; pipeline agents do not.
export const isRoot = (descriptor) => Array.isArray(descriptor.phases) && descriptor.phases.length > 0

const hasParent = (descriptor) =>
  typeof descriptor.dispatchedBy === 'string' && descriptor.dispatchedBy.trim() !== ''

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
