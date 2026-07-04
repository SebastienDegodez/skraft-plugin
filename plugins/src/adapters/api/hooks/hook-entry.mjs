import { normalise } from './payload.mjs'

// Payload event field varies by harness: Claude Code and the Copilot compat
// layer send hook_event_name (→ hookEventName after normalisation); tests and
// older callers send hookType/type. The CLI also injects the event name from
// argv as fallbackHookType — last resort when the payload carries none.
export const createHookEntry = (router, { fallbackHookType } = {}) => ({
  handle: async (rawPayload) => {
    const payload = normalise(rawPayload)
    const hookType = payload.hookType ?? payload.type ?? payload.hookEventName ?? fallbackHookType
    return router.route(hookType, payload)
  }
})
