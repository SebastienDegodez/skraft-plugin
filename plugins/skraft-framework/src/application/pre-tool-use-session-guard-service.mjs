import { isErr } from '../domain/result.mjs'
import { guardProtectedArtifact } from '../domain/session-guard-policy.mjs'
import { createWriteRightsGuard, writeOf } from './write-rights-guard.mjs'
import { allow, deny } from '../adapters/api/hooks/decision.mjs'

// PreToolUse session guard (G7/G8) of the settings hook. Wires the pure session-guard
// policy and the write-rights use case to the audit seam. State-independent: it never
// reads the state.
//   G7: a direct write to state.json / execution-log / the active pointer is denied
//       whatever the phase and whoever the caller.
//   G8: a write outside the caller's write rights is denied. The caller is the agent the
//       payload names (Claude Code's agent_type), without the agents that spawned it: an
//       agent no write right governs is unidentified. A Claude Code payload that names
//       none comes from the main session, which no agent runs; any other payload that
//       names none (every Copilot preToolUse) is unidentified, and passes.

// Who calls, as the payload says it.
const callerOf = (payload) => {
  if (typeof payload.agentName === 'string' && payload.agentName.length > 0) return { chain: [payload.agentName], complete: false }
  if (payload.harness === 'claude-code') return { chain: [] }
  return null
}

const safeNow = (clock) => {
  try { return clock.now() } catch { return new Date().toISOString() }
}

const audit = async (auditWriter, entry) => {
  try { await auditWriter.write(entry) } catch { /* audit failure must never change the decision */ }
}

export const createPreToolUseSessionGuardService = ({ auditWriter, clock, trackingDir, trackingRoot, config }) => {
  const writeRights = createWriteRightsGuard({ config, trackingRoot })
  return { handle: async (payload = {}) => {
    const { command, filePaths } = writeOf(payload)
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

    // G7 — protected-artifact write ban (always enforced, state-independent).
    // The session directory: a relative path (rm state.json after a cd) resolves from it.
    const cwd = typeof payload.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : undefined
    for (const filePath of [undefined, ...filePaths]) {
      const protectedResult = guardProtectedArtifact({ command: filePath === undefined ? command : undefined, filePath, trackingDir, cwd })
      if (isErr(protectedResult)) {
        await record({ decision: 'DENY', code: protectedResult.error.code, reason: protectedResult.error.reason })
        return deny(protectedResult.error.reason)
      }
    }

    // G8 — write rights of the caller's role.
    const judged = writeRights.judge({ caller: callerOf(payload), calls: [payload], cwd })
    if (!judged.allowed) {
      await record({ decision: 'DENY', code: judged.code, reason: judged.reason })
      return deny(judged.reason)
    }
    // Without an active pipeline an allowed call is not worth an audit line.
    if (projectSlug) await record({ decision: 'ALLOW', code: judged.code, reason: judged.reason })
    return allow()
  } }
}
