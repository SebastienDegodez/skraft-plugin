import { createHookRouter } from './hook-router.mjs'
import { createHookEntry } from './hook-entry.mjs'

export const createHookService = ({ preToolUse, subagentStop } = {}) => {
  // Composition root: wire handlers, router, entry point in one place.
  const router = createHookRouter({ preToolUse, subagentStop })
  return createHookEntry(router)
}
