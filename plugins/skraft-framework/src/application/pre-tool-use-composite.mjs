import { allow } from '../adapters/api/hooks/decision.mjs'

// PreToolUse composite: one event, two guards.
//
//   provenance guard           — runs on every agent dispatch, pipeline or not: no
//                               self-dispatch, no dispatch outside the declared tree.
//   G7/G8 session guard        — always runs (G7 protected-artifact ban is unconditional;
//                               G8 workspace-write check applies during DELIVER).
//
// The dispatch-order guard (G1) and the handoff guard (G9) are gone from the hooks: the
// pipeline is code (RunPipeline), which checks both before every dispatch it makes
// (domain evaluateDispatch, evaluateHandoff).
//
// Decisions combine FAIL-CLOSED: block > deny > allow. A missing guard is a safe allow.

const requestedAgentOf = (payload) =>
  payload.requestedAgent ?? payload.toolInput?.subagentType

const combine = (decisions) =>
  decisions.find((d) => d.decision === 'block')
    ?? decisions.find((d) => d.decision === 'deny')
    ?? allow()

export const createPreToolUseCompositeService = ({ sessionGuard, provenanceGuard } = {}) => ({
  handle: async (payload = {}) => {
    const decisions = []
    const requestedAgent = requestedAgentOf(payload)
    if (provenanceGuard && requestedAgent) {
      decisions.push(await provenanceGuard.handle({ agentName: payload.agentName, requestedAgent }))
    }
    if (sessionGuard) {
      decisions.push(await sessionGuard.handle(payload))
    }
    return combine(decisions)
  }
})
