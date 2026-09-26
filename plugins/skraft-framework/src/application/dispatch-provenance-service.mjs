import { isErr } from '../domain/result.mjs'
import { evaluateDispatchProvenance } from '../domain/pipeline-policy.mjs'
import { allow, deny } from '../adapters/api/hooks/decision.mjs'

// PreToolUse(Agent) provenance guard: refuses a self-dispatch and a dispatch outside the
// declared tree, with or without an active pipeline. Only refusals are audited. Any
// failure allows: the tree is a structure check, not the record the pipeline stands on.
export const createDispatchProvenanceService = ({ config, auditWriter, clock }) => ({
  handle: async ({ agentName, requestedAgent }) => {
    try {
      const result = evaluateDispatchProvenance(agentName, requestedAgent, config)
      if (!isErr(result)) return allow()
      await auditWriter.write({
        event: 'DispatchProvenanceEvaluated',
        callerAgent: agentName,
        requestedAgent,
        decision: 'DENY',
        code: result.error.code,
        reason: result.error.reason,
        evaluatedAt: clock.now(),
      }).catch(() => {})
      return deny(result.error.reason)
    } catch {
      return allow()
    }
  },
})
