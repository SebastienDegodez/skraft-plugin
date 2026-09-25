import { normalise } from './payload.mjs'

export const createHookEntry = (router) => ({
  handle: async (rawPayload) => {
    // Clean incoming payload first, then route on normalized hook name. Real harness
    // payloads carry `hook_event_name` (normalised to hookEventName), so accept it too:
    // without it, an in-process call with no CLI arg routes nowhere.
    const payload = normalise(rawPayload)
    const hookType = payload.hookType ?? payload.hookEventName ?? payload.type
    return router.route(hookType, payload)
  }
})
