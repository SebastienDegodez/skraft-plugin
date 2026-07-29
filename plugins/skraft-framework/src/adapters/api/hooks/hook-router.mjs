export const createHookRouter = ({ preToolUse, subagentStart, subagentStop, postToolUse } = {}) => ({
  route: async (hookType, payload) => {
    switch (hookType) {
      case 'PreToolUse':
        return preToolUse ? preToolUse.handle(payload) : undefined
      case 'SubagentStart':
        return subagentStart ? subagentStart.handle(payload) : undefined
      case 'SubagentStop':
        return subagentStop ? subagentStop.handle(payload) : undefined
      case 'PostToolUse':
        return postToolUse ? postToolUse.handle(payload) : undefined
      default:
        return undefined
    }
  }
})
