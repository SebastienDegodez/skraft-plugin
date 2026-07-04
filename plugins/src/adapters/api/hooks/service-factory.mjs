import { createHookRouter } from './hook-router.mjs'
import { createHookEntry } from './hook-entry.mjs'

export const createHookService = ({ preToolUse, subagentStart, subagentStop, postToolUse, sessionStart, fallbackHookType } = {}) => {
  const router = createHookRouter({ preToolUse, subagentStart, subagentStop, postToolUse, sessionStart })
  return createHookEntry(router, { fallbackHookType })
}
