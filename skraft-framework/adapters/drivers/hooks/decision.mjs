export const allow = (message) =>
  message ? { decision: 'allow', message } : { decision: 'allow' }

export const deny = (message) => ({ decision: 'deny', message: message ?? 'Denied' })
export const block = (message) => ({ decision: 'block', message: message ?? 'Blocked' })
export const additionalContext = (context) => ({ decision: 'additionalContext', context })
