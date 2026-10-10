import { allow } from '../adapters/api/hooks/decision.mjs'

// PreToolUse composite: one event, two guards.
//
//   provenance guard           — runs on every agent dispatch, pipeline or not: no
//                               self-dispatch, no dispatch outside the declared tree.
//   G7/G8 session guard        — always runs: the protected-artifact ban is unconditional;
//                               an orchestrator src/ or tests/ write is refused.
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

// A batched payload (Copilot `toolCalls`) is one call per entry, each carrying the
// session context of the payload; any other payload is its own single call.
const callsOf = (payload) => {
  if (!Array.isArray(payload.toolCalls) || payload.toolCalls.length === 0) return [payload]
  const { toolCalls, toolName, toolInput, requestedAgent, filePath, ...session } = payload
  return toolCalls.map((call) => ({ ...session, ...call }))
}

export const createPreToolUseCompositeService = ({ sessionGuard, provenanceGuard } = {}) => ({
  handle: async (payload = {}) => {
    const decisions = []
    for (const call of callsOf(payload)) {
      const requestedAgent = requestedAgentOf(call)
      if (provenanceGuard && requestedAgent) {
        decisions.push(await provenanceGuard.handle({ agentName: call.agentName, requestedAgent }))
      }
      if (sessionGuard) {
        decisions.push(await sessionGuard.handle(call))
      }
    }
    return combine(decisions)
  }
})
