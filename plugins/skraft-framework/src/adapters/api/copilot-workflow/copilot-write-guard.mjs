import { fromHarnessInput } from '../hooks/harness-input.mjs'
import { createWriteRightsGuard } from '../../../application/write-rights-guard.mjs'

// Driving adapter: G8 on GitHub Copilot, as the extension's `onPreToolUse` session hook
// (com.github.copilot/extensions/skraft-pipeline/extension.mjs). It resolves who calls
// from what the Copilot runtime itself tells the extension, never from a file, and hands
// the calls to the WriteRightsGuard use case.
//
// Who calls (createCopilotCallerRegistry):
//   - a hook input whose sessionId is the joined session's (invocation.sessionId) is the
//     main session: the custom agent selected there (session.rpc.agent.getCurrent at join,
//     then `subagent.selected` / `subagent.deselected`), or no agent at all;
//   - any other sessionId is a sub-agent's: the runtime announced it with a
//     `subagent.started` event (agentName, agentDisplayName, parentId), keyed by the
//     data's toolCallId and by the event's agentId — the two ids a sub-agent's hook input
//     has been seen to carry as its sessionId; an agentId already known is another
//     agent's, and is not taken over. Workflow agents (ctx.agent) included.
//   - an id no event announced, or a main session whose selection was never read, is
//     unidentified: the guard lets it pass (UNIDENTIFIED_CALLER).
// A sub-agent that is not governed takes the rights of the agent that spawned it; one the
// main session spawned (no parentId, no workflow run) takes the main session's agent.

const isText = (value) => typeof value === 'string' && value.length > 0
const namesOf = (...values) => [...new Set(values.filter(isText))]

// The tools that write: a guard that fails refuses these, and lets any other call pass.
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash'])

// Enough for every sub-agent of a long session; the oldest go first.
const MAX_AGENTS = 1000

export const createCopilotCallerRegistry = () => {
  const agents = new Map()
  let main = { known: false, names: [] }
  let selectionSeen = false

  const remember = (id, entry) => {
    agents.delete(id)
    agents.set(id, entry)
    while (agents.size > MAX_AGENTS) agents.delete(agents.keys().next().value)
  }

  const chainOf = (entry) => {
    const chain = []
    const seen = new Set()
    let current = entry
    while (current && !seen.has(current)) {
      seen.add(current)
      chain.push(...current.names)
      if (current.workflow) return chain
      if (!isText(current.parentId)) return main.known ? [...chain, ...main.names] : chain
      current = agents.get(current.parentId)
    }
    return chain
  }

  return Object.freeze({
    // One session event, as session.on hands it over.
    observe: (event) => {
      const data = event?.data ?? {}
      if (event?.type === 'subagent.started') {
        const entry = Object.freeze({
          names: namesOf(data.agentName, data.agentDisplayName),
          parentId: data.parentId ?? null,
          workflow: isText(data.factoryRunId) || isText(data.workflowRunId),
        })
        if (isText(data.toolCallId)) remember(data.toolCallId, entry)
        if (isText(event.agentId) && !agents.has(event.agentId)) remember(event.agentId, entry)
      } else if (isText(event?.agentId)) {
        // A selection inside a sub-agent is not the main session's.
      } else if (event?.type === 'subagent.selected') {
        selectionSeen = true
        main = { known: true, names: namesOf(data.agentName, data.agentDisplayName, data.name, data.displayName) }
      } else if (event?.type === 'subagent.deselected') {
        selectionSeen = true
        main = { known: true, names: [] }
      }
    },
    // The answer of session.rpc.agent.getCurrent(): { agent: { id, name, displayName } | null }.
    // A selection event seen meanwhile is newer, and wins.
    selectedAtJoin: (answer) => {
      if (selectionSeen) return
      const agent = answer?.agent ?? null
      main = { known: true, names: agent ? namesOf(agent.name, agent.displayName, agent.id) : [] }
    },
    // { chain } for the hook input's session, or null when nothing says who runs it.
    callerOf: (sessionId, rootSessionId) => {
      if (!isText(sessionId) || sessionId === rootSessionId) return main.known ? { chain: [...main.names] } : null
      const entry = agents.get(sessionId)
      return entry ? { chain: chainOf(entry) } : null
    },
  })
}

// The extension's onPreToolUse handler. `trackingDirOf(cwd)` names the tracking directory
// of a working copy; `audit(entry)` records a refusal. A refusal answers `deny`; anything
// else answers nothing, so the other hooks and the permission handler decide. A guard that
// fails refuses a call that writes.
export const createCopilotWriteGuard = ({ config, registry, trackingDirOf, audit = async () => {} } = {}) => {
  const guards = new Map()
  const guardFor = (trackingDir) => {
    if (!guards.has(trackingDir)) guards.set(trackingDir, createWriteRightsGuard({ config, trackingDir }))
    return guards.get(trackingDir)
  }
  return async (input = {}, invocation = {}) => {
    const payload = fromHarnessInput({ toolName: input.toolName, toolArgs: input.toolArgs, toolCalls: input.toolCalls }, { env: {} })
    const calls = Array.isArray(payload.toolCalls) && payload.toolCalls.length > 0 ? payload.toolCalls : [payload]
    let verdict
    try {
      const cwd = input.workingDirectory ?? input.cwd
      verdict = guardFor(trackingDirOf(cwd)).judge({ caller: registry.callerOf(input.sessionId, invocation.sessionId), calls, cwd })
    } catch (error) {
      if (!calls.some((call) => WRITE_TOOLS.has(call.toolName))) return undefined
      return { permissionDecision: 'deny', permissionDecisionReason: `skraft G8: the write-rights guard could not judge this call (${error?.message ?? error}); it is refused` }
    }
    if (verdict.allowed) return undefined
    try {
      await audit({ event: 'SessionGuardEvaluated', source: 'copilot-extension', agentName: verdict.agent, decision: 'DENY', code: verdict.code, reason: verdict.reason })
    } catch { /* an audit failure never changes the decision */ }
    return { permissionDecision: 'deny', permissionDecisionReason: `skraft G8: ${verdict.reason}` }
  }
}
