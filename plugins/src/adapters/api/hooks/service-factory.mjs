import { createHookRouter } from './hook-router.mjs'
import { createHookEntry } from './hook-entry.mjs'

export const createHookService = ({ preToolUse, subagentStart, subagentStop, postToolUse } = {}) => {
  const router = createHookRouter({ preToolUse, subagentStart, subagentStop, postToolUse })
  return createHookEntry(router)
}
