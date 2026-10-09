import { isErr } from '../domain/result.mjs'
import { guardOrchestratorWrite, guardProtectedArtifact } from '../domain/session-guard-policy.mjs'
import { canonicalAgentName } from '../domain/instruction-policy.mjs'
import { allow, deny } from '../adapters/api/hooks/decision.mjs'

// PreToolUse session guard (G7/G8). Wires the pure session-guard policy to the audit seam.
// G7: a direct write to state.json / execution-log / the active pointer is denied whatever
// the phase and whoever the caller. G8: a src/ or tests/ write by the orchestrator is
// denied; an unnamed caller passes. State-independent, so it never reads the state.

// The orchestrator: the agent that dispatches the pipeline's phase agents.
const orchestratorsFrom = (config) => {
  const dispatchers = config?.agentDispatchers ?? {}
  const names = Object.values(config?.phaseAgents ?? {})
    .flatMap((phase) => [phase?.specialist, phase?.reviewer])
    .filter((agent) => typeof agent === 'string')
    .map((agent) => dispatchers[agent] ?? dispatchers[canonicalAgentName(agent, config)])
    .filter((dispatcher) => typeof dispatcher === 'string')
    .map((dispatcher) => canonicalAgentName(dispatcher, config))
  return [...new Set(names)]
}

// Tools that write the file they name.
const FILE_WRITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

// Extract the write signals from a normalised PreToolUse payload. Bash carries the
// command; file-writing tools carry the adapter's filePath signal or legacy arguments.
const writeSignals = (payload) => {
  const toolName = payload.toolName
  const toolInput = payload.toolInput ?? {}
  const command = toolName === 'Bash' && typeof toolInput.command === 'string' ? toolInput.command : undefined
  const filePath = FILE_WRITING_TOOLS.has(toolName)
    ? (payload.filePath ?? toolInput.filePath ?? toolInput.path ?? toolInput.notebook_path ?? undefined)
    : undefined
  return { command, filePath }
}

const safeNow = (clock) => {
  try { return clock.now() } catch { return new Date().toISOString() }
}

const audit = async (auditWriter, entry) => {
  try { await auditWriter.write(entry) } catch { /* audit failure must never change the decision */ }
}

export const createPreToolUseSessionGuardService = ({ auditWriter, clock, trackingDir, config }) => {
  const orchestrators = orchestratorsFrom(config)
  return { handle: async (payload = {}) => {
    const { command, filePath } = writeSignals(payload)
    const projectSlug = payload.projectSlug ?? null
    const record = (fact) => audit(auditWriter, {
      event: 'SessionGuardEvaluated',
      projectSlug,
      agentName: payload.agentName ?? null,
      decision: fact.decision,
      code: fact.code,
      reason: fact.reason,
      evaluatedAt: safeNow(clock)
    })

    const protectedResult = guardProtectedArtifact({ command, filePath, trackingDir })
    if (isErr(protectedResult)) {
      await record({ decision: 'DENY', code: protectedResult.error.code, reason: protectedResult.error.reason })
      return deny(protectedResult.error.reason)
    }
    const orchestratorResult = guardOrchestratorWrite({
      command, filePath, orchestrators,
      agentName: canonicalAgentName(payload.agentName, config)
    })
    if (isErr(orchestratorResult)) {
      await record({ decision: 'DENY', code: orchestratorResult.error.code, reason: orchestratorResult.error.reason })
      return deny(orchestratorResult.error.reason)
    }
    // Without an active pipeline an allowed call is not worth an audit line.
    if (projectSlug) await record({ decision: 'ALLOW', code: 'CONFORMING', reason: orchestratorResult.value.reason })
    return allow()
  } }
}
