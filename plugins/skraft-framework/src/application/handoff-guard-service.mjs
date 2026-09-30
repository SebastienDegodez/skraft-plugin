import { isErr } from '../domain/result.mjs'
import { evaluateHandoff } from '../domain/handoff-policy.mjs'
import { isPipelineAgent } from '../domain/pipeline-policy.mjs'
import { allow, deny } from '../adapters/api/hooks/decision.mjs'

// PreToolUse handoff guard (G9). A phase-agent dispatch whose prompt omits a recorded
// required input — the test plan, the research, the previous review on a retry — is
// denied with the list of what is missing, so the orchestrator re-dispatches with the
// block `state.mjs handoff` prints instead of letting the agent re-derive it.
// Fail-open (ADR-006) on an unreadable state: G1 already fails closed on it.

const safeNow = (clock) => {
  try { return clock.now() } catch { return new Date().toISOString() }
}

export const createHandoffGuardService = ({ stateReader, auditWriter, config, clock }) => ({
  handle: async ({ requestedAgent, projectSlug, prompt } = {}) => {
    if (!projectSlug || !isPipelineAgent(requestedAgent, config)) return allow()
    let state
    try {
      state = await stateReader.read(projectSlug)
    } catch {
      return allow()
    }
    try {
      const evaluation = evaluateHandoff({ agent: requestedAgent, state, config, prompt })
      const denied = isErr(evaluation)
      await auditWriter.write({
        event: 'HandoffEvaluated',
        projectSlug,
        requestedAgent,
        decision: denied ? 'DENY' : 'ALLOW',
        code: denied ? evaluation.error.code : 'COMPLETE',
        missing: denied ? evaluation.error.missing : [],
        evaluatedAt: safeNow(clock),
      }).catch(() => {})
      return denied ? deny(evaluation.error.reason) : allow()
    } catch {
      return allow()
    }
  },
})
