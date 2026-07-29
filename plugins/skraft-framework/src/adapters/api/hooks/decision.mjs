// Allow = harness can keep going.
export const allow = (message) =>
  message ? { decision: 'allow', message } : { decision: 'allow' }

// Deny = stop this action, but normal control path.
export const deny = (message) => ({ decision: 'deny', message: message ?? 'Denied' })
// Block = hard stop. Harness should treat this like stronger refusal.
export const block = (message) => ({ decision: 'block', message: message ?? 'Blocked' })
// Extra context = action can continue, but harness should feed this back in.
export const additionalContext = (context) => ({ decision: 'additionalContext', context })
