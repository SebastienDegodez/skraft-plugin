export const createHookRouter = ({ preToolUse, subagentStop } = {}) => ({
  route: async (hookType, payload) => {
    // Simple switchboard: pick right handler from hook type.
    switch (hookType) {
      case 'PreToolUse':
        if (!preToolUse) throw new Error('No PreToolUse handler registered')
        return preToolUse.handle(payload)
      case 'SubagentStop':
        if (!subagentStop) throw new Error('No SubagentStop handler registered')
        return subagentStop.handle(payload)
      default:
        throw new Error(`Unknown hook type: ${hookType}`)
    }
  }
})
