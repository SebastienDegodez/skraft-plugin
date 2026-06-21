export const createHookRouter = ({ preToolUse, subagentStop } = {}) => ({
  route: async (hookType, payload) => {
    // Simple switchboard: pick right handler from hook type.
    switch (hookType) {
      case 'PreToolUse':
        return preToolUse ? preToolUse.handle(payload) : undefined
      case 'SubagentStop':
        return subagentStop ? subagentStop.handle(payload) : undefined
      default:
        return undefined
    }
  }
})
