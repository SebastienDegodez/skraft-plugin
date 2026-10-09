import { allow } from '../adapters/api/hooks/decision.mjs'

// PreToolUse composite: one event, two guards. The manifest routes both PreToolUse(Agent)
// and PreToolUse(Bash) to a single hook entry, but two independent guards govern that event:
//
//   G1  dispatch-order guard  — runs ONLY for orchestrator-tracked agent dispatches
//                               (a projectSlug AND a requestedAgent are present). Skipping
//                               it when there is no pipeline context is what keeps a
//                               directly-invoked standalone agent from being fail-closed
//                               blocked on a missing state file.
//   G7/G8 session guard       — always runs: the protected-artifact ban is unconditional;
//                               an orchestrator src/ or tests/ write is refused.
//   provenance guard           — runs on every agent dispatch, pipeline or not: no
//                               self-dispatch, no dispatch outside the declared tree.
//   G9  handoff guard          — runs with G1: a phase-agent dispatch must name every
//                               recorded required input (test plan, research, previous
//                               review on a retry) in its prompt.
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

export const createPreToolUseCompositeService = ({ dispatchGuard, sessionGuard, provenanceGuard, handoffGuard } = {}) => ({
  handle: async (payload = {}) => {
    const decisions = []

    for (const call of callsOf(payload)) {
      const requestedAgent = requestedAgentOf(call)
      if (provenanceGuard && requestedAgent) {
        decisions.push(await provenanceGuard.handle({ agentName: call.agentName, requestedAgent }))
      }
      if (dispatchGuard && call.projectSlug && requestedAgent) {
        decisions.push(await dispatchGuard.handle({ requestedAgent, projectSlug: call.projectSlug }))
      }
      if (handoffGuard && call.projectSlug && requestedAgent) {
        decisions.push(await handoffGuard.handle({ requestedAgent, projectSlug: call.projectSlug, prompt: call.toolInput?.prompt }))
      }

      if (sessionGuard) {
        decisions.push(await sessionGuard.handle(call))
      }
    }

    return combine(decisions)
  }
})
