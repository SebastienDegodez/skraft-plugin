import { createHookRouter } from './hook-router.mjs'
import { createHookEntry } from './hook-entry.mjs'

export const createHookService = ({ preToolUse, subagentStop } = {}) => {
  const router = createHookRouter({ preToolUse, subagentStop })
  return createHookEntry(router)
}
