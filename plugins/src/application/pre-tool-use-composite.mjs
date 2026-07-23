import { allow } from '../adapters/api/hooks/decision.mjs'

// PreToolUse composite: one event, two guards. The manifest routes both PreToolUse(Agent)
// and PreToolUse(Bash) to a single hook entry, but two independent guards govern that event:
//
//   G1  dispatch-order guard  — runs ONLY for orchestrator-tracked agent dispatches
//                               (a projectSlug AND a requestedAgent are present). Skipping
//                               it when there is no pipeline context is what keeps a
//                               directly-invoked standalone agent from being fail-closed
//                               blocked on a missing state file.
//   G7/G8 session guard        — always runs (G7 protected-artifact ban is unconditional;
//                               G8 workspace-write check applies during DELIVER).
//
// Decisions combine FAIL-CLOSED: block > deny > allow. A missing guard is a safe allow.

const requestedAgentOf = (payload) =>
  payload.requestedAgent ?? payload.toolInput?.subagentType

const combine = (decisions) =>
  decisions.find((d) => d.decision === 'block')
    ?? decisions.find((d) => d.decision === 'deny')
    ?? allow()

export const createPreToolUseCompositeService = ({ dispatchGuard, sessionGuard } = {}) => ({
  handle: async (payload = {}) => {
    const decisions = []

    const requestedAgent = requestedAgentOf(payload)
    if (dispatchGuard && payload.projectSlug && requestedAgent) {
      decisions.push(await dispatchGuard.handle({ requestedAgent, projectSlug: payload.projectSlug }))
    }

    if (sessionGuard) {
      decisions.push(await sessionGuard.handle(payload))
    }

    return combine(decisions)
  }
})
