// Single source of truth for routable hook types — the freshness gate
// (check-freshness CLI) compares plugins/hooks/hooks.json against this list.
export const SUPPORTED_HOOK_TYPES = Object.freeze([
  'PreToolUse',
  'SubagentStart',
  'SubagentStop',
  'PostToolUse',
  'SessionStart'
])

export const createHookRouter = ({ preToolUse, subagentStart, subagentStop, postToolUse, sessionStart } = {}) => {
  const handlers = {
    PreToolUse: preToolUse,
    SubagentStart: subagentStart,
    SubagentStop: subagentStop,
    PostToolUse: postToolUse,
    SessionStart: sessionStart
  }
  return {
    route: async (hookType, payload) => {
      const handler = handlers[hookType]
      return handler ? handler.handle(payload) : undefined
    }
  }
}
