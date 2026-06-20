import { normalise } from './payload.mjs'

export const createHookEntry = (router) => ({
  handle: async (rawPayload) => {
    const payload = normalise(rawPayload)
    const hookType = payload.hookType ?? payload.type
    return router.route(hookType, payload)
  }
})
