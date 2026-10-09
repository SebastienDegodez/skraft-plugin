import { isErr } from '../domain/result.mjs'
import { guardProtectedArtifact, guardWorkspaceWrite } from '../domain/session-guard-policy.mjs'
import { canonicalAgentName } from '../domain/instruction-policy.mjs'
import { allow, deny } from '../adapters/api/hooks/decision.mjs'

// PreToolUse session guard (G7/G8). Wires the pure session-guard policy to the
// recorded pipeline state and the audit seam.
//
// G7 (state-independent) is always enforced: a direct write to state.json /
// execution-log is denied whatever the phase. G8 needs the recorded phase; if the
// state cannot be read we fail-open on that guard alone (a hook bug must never freeze
// the pipeline — README fail-mode rule), G7 having already run.

// The DELIVER specialist and reviewer, plus every agent they dispatch, transitively
// (the engineer's workers, the reviewer's lenses) — all run inside the monitored phase.
const deliverAgentsFrom = (config) => {
  const deliver = config?.phaseAgents?.DELIVER ?? {}
  const monitored = new Set([deliver.specialist, deliver.reviewer]
    .filter((a) => typeof a === 'string')
    .map((a) => canonicalAgentName(a, config)))
  const dispatchers = Object.entries(config?.agentDispatchers ?? {})
  let grew = monitored.size > 0
  while (grew) {
    grew = false
    for (const [agent, dispatcher] of dispatchers) {
      const name = canonicalAgentName(agent, config)
      if (!monitored.has(name) && monitored.has(canonicalAgentName(dispatcher, config))) {
        monitored.add(name)
        grew = true
      }
    }
  }
  return [...monitored]
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

// A harness that names no agent on a sub-agent's tool call (Copilot) still names its
// session: the registry resolves that session to the agent it runs. Never throws.
const resolveAgentName = async (agentRegistry, sessionId) => {
  if (!agentRegistry || typeof sessionId !== 'string' || sessionId.length === 0) return null
  try { return (await agentRegistry.agentNameOf(sessionId)) ?? null } catch { return null }
}

export const createPreToolUseSessionGuardService = ({ stateReader, auditWriter, config, clock, trackingDir, agentRegistry }) => ({
  handle: async (payload = {}) => {
    const { command, filePath } = writeSignals(payload)
    let agentName = payload.agentName ?? null
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
    const protectedResult = guardProtectedArtifact({ command, filePath, trackingDir })
    if (isErr(protectedResult)) {
      await record({ decision: 'DENY', code: protectedResult.error.code, reason: protectedResult.error.reason })
      return deny(protectedResult.error.reason)
    }

    // G8 — workspace write must run inside the monitored DELIVER sub-agent. Without an
    // active pipeline there is no phase to guard, and nothing worth an audit line.
    if (!projectSlug) return allow()
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
    const evaluate = () => guardWorkspaceWrite({
      command, filePath, phase,
      agentName: canonicalAgentName(agentName, config) ?? null,
      deliverAgents
    })
    let workspaceResult = evaluate()
    if (isErr(workspaceResult) && agentName === null) {
      agentName = await resolveAgentName(agentRegistry, payload.sessionId)
      if (agentName !== null) workspaceResult = evaluate()
    }
    if (isErr(workspaceResult)) {
      await record({ decision: 'DENY', code: workspaceResult.error.code, reason: workspaceResult.error.reason })
      return deny(workspaceResult.error.reason)
    }

    await record({ decision: 'ALLOW', code: 'CONFORMING', reason: workspaceResult.value.reason })
    return allow()
  }
})
