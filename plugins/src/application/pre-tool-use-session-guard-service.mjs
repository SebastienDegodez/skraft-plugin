import { isErr } from '../domain/result.mjs'
import { guardProtectedArtifact, guardWorkspaceWrite } from '../domain/session-guard-policy.mjs'
import { allow, deny } from '../adapters/api/hooks/decision.mjs'

// PreToolUse session guard (G7/G8). Wires the pure session-guard policy to the
// recorded pipeline state and the audit seam.
//
// G7 (state-independent) is always enforced: a direct write to state.json /
// execution-log is denied whatever the phase. G8 needs the recorded phase; if the
// state cannot be read we fail-open on that guard alone (a hook bug must never freeze
// the pipeline — README fail-mode rule), G7 having already run.

const deliverAgentsFrom = (config) => {
  const deliver = config?.phaseAgents?.DELIVER ?? {}
  return [deliver.specialist, deliver.reviewer].filter((a) => typeof a === 'string')
}

// Extract the write signals from a normalised PreToolUse payload. Bash carries the
// command; Write/Edit tools carry the file path (filePath or path).
const writeSignals = (payload) => {
  const toolName = payload.toolName
  const toolInput = payload.toolInput ?? {}
  const command = toolName === 'Bash' && typeof toolInput.command === 'string' ? toolInput.command : undefined
  const filePath = (toolName === 'Write' || toolName === 'Edit') ? (toolInput.filePath ?? toolInput.path ?? undefined) : undefined
  return { command, filePath }
}

const safeNow = (clock) => {
  try { return clock.now() } catch { return new Date().toISOString() }
}

const audit = async (auditWriter, entry) => {
  try { await auditWriter.write(entry) } catch { /* audit failure must never change the decision */ }
}

export const createPreToolUseSessionGuardService = ({ stateReader, auditWriter, config, clock }) => ({
  handle: async (payload = {}) => {
    const { command, filePath } = writeSignals(payload)
    const agentName = payload.agentName ?? null
    const projectSlug = payload.projectSlug ?? null
    const evaluatedAt = safeNow(clock)

    const record = (fact) => audit(auditWriter, {
      event: 'SessionGuardEvaluated',
      projectSlug,
      agentName,
      decision: fact.decision,
      code: fact.code,
      reason: fact.reason,
      evaluatedAt
    })

    // G7 — protected-artifact write ban (always enforced, state-independent).
    const protectedResult = guardProtectedArtifact({ command, filePath })
    if (isErr(protectedResult)) {
      await record({ decision: 'DENY', code: protectedResult.error.code, reason: protectedResult.error.reason })
      return deny(protectedResult.error.reason)
    }

    // G8 — workspace write must run inside the monitored DELIVER sub-agent.
    let phase = null
    try {
      const raw = await stateReader.read(projectSlug)
      phase = raw?.currentPhase ?? null
    } catch (error) {
      const reason = `recorded pipeline state unreadable; session guard fail-open: ${error?.message ?? String(error)}`
      await record({ decision: 'ALLOW', code: 'UNREADABLE_STATE', reason })
      return allow()
    }

    const deliverAgents = deliverAgentsFrom(config)
    if (phase === 'DELIVER' && deliverAgents.length === 0) {
      await record({ decision: 'ALLOW', code: 'UNCONFIGURED_DELIVER_AGENTS', reason: 'no monitored DELIVER agents configured; session guard fail-open' })
      return allow()
    }
    const workspaceResult = guardWorkspaceWrite({ command, filePath, phase, agentName, deliverAgents })
    if (isErr(workspaceResult)) {
      await record({ decision: 'DENY', code: workspaceResult.error.code, reason: workspaceResult.error.reason })
      return deny(workspaceResult.error.reason)
    }

    await record({ decision: 'ALLOW', code: 'CONFORMING', reason: workspaceResult.value.reason })
    return allow()
  }
})
