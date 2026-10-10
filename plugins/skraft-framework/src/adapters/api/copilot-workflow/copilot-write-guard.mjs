import { fromHarnessInput } from '../hooks/harness-input.mjs'
import { createWriteRightsGuard } from '../../../application/write-rights-guard.mjs'

// Driving adapter: G8 and dispatch provenance on GitHub Copilot, as the extension's
// `onPreToolUse` session hook (com.github.copilot/extensions/skraft-pipeline/extension.mjs).
// It resolves who calls from what the Copilot runtime itself tells the extension, never
// from a file, and hands the calls to the DispatchProvenance and WriteRightsGuard use cases.
//
// Who calls (createCopilotCallerRegistry):
//   - a hook input whose sessionId is the joined session's (invocation.sessionId) is the
//     main session: the custom agent selected there (session.rpc.agent.getCurrent at join,
//     then `subagent.selected` / `subagent.deselected`), or no agent at all;
//   - any other sessionId is a sub-agent's: the runtime announced it with a
//     `subagent.started` event (agentName, agentDisplayName), keyed by the data's
//     toolCallId only. The event's agentId is the sub-agent that emitted the event, not the
//     one it starts: it is never a key.
//   - the agents that spawned a sub-agent follow data.parentId while it names an announced
//     sub-agent. A chain that stops before the main session (no parentId: the SDK 1.0.9
//     runtime never sends one; an unannounced parent) is incomplete, and a workflow agent's
//     (factoryRunId) is complete: the pipeline's code spawned it.
//   - an id no event announced, or a main session whose selection was never read, is
//     unidentified, and so is an incomplete chain no governed agent starts: the guard lets
//     it pass (UNIDENTIFIED_CALLER). An ambiguous mapping is never read as another agent.

const isText = (value) => typeof value === 'string' && value.length > 0
const namesOf = (...values) => [...new Set(values.filter(isText))]

// The tools that write: a guard that fails refuses these, and lets any other call pass.
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'WriteBash', 'ApplyPatch', 'StrReplaceEditor', 'Agent'])

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
      if (current.workflow) return { chain, complete: true }
      if (!isText(current.parentId)) return { chain, complete: false }
      current = agents.get(current.parentId)
    }
    return { chain, complete: false }
  }

  return Object.freeze({
    // One session event, as session.on hands it over.
    observe: (event) => {
      const data = event?.data ?? {}
      if (event?.type === 'subagent.started') {
        if (!isText(data.toolCallId)) return
        remember(data.toolCallId, Object.freeze({
          names: namesOf(data.agentName, data.agentDisplayName),
          parentId: isText(data.parentId) ? data.parentId : null,
          workflow: isText(data.factoryRunId) || isText(data.workflowRunId),
        }))
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
    // { chain, complete } for the hook input's session, or null when nothing says who runs it.
    callerOf: (sessionId, rootSessionId) => {
      if (!isText(sessionId) || sessionId === rootSessionId) return main.known ? { chain: [...main.names], complete: true } : null
      const entry = agents.get(sessionId)
      return entry ? chainOf(entry) : null
    },
  })
}

// The extension's onPreToolUse handler. `trackingRootOf(cwd)` names the tracking root of a
// working copy; `provenance` is the DispatchProvenance service, which audits its own
// refusals; `audit(entry)` records a G8 refusal. A refusal answers `deny`;
// anything else answers nothing, so the other hooks and the permission handler decide. A
// guard that fails refuses a call that writes or starts an agent.
export const createCopilotWriteGuard = ({ config, registry, trackingRootOf, provenance = null, audit = async () => {} } = {}) => {
  const guards = new Map()
  const guardFor = (trackingRoot) => {
    if (!guards.has(trackingRoot)) guards.set(trackingRoot, createWriteRightsGuard({ config, trackingRoot }))
    return guards.get(trackingRoot)
  }
  const refuse = (reason) => ({ permissionDecision: 'deny', permissionDecisionReason: reason })

  return async (input = {}, invocation = {}) => {
    const payload = fromHarnessInput({ toolName: input.toolName, toolArgs: input.toolArgs, toolCalls: input.toolCalls }, { env: {} })
    const calls = Array.isArray(payload.toolCalls) && payload.toolCalls.length > 0 ? payload.toolCalls : [payload]
    let verdict
    try {
      const caller = registry.callerOf(input.sessionId, invocation.sessionId)
      for (const call of calls) {
        if (!provenance || !isText(call.requestedAgent)) continue
        const decision = await provenance.handle({ agentName: caller?.chain?.[0], requestedAgent: call.requestedAgent })
        if (decision?.decision === 'deny' || decision?.decision === 'block') return refuse(`skraft provenance: ${decision.message}`)
      }
      const cwd = input.workingDirectory ?? input.cwd
      verdict = guardFor(trackingRootOf(cwd)).judge({ caller, calls, cwd })
    } catch (error) {
      if (!calls.some((call) => WRITE_TOOLS.has(call.toolName))) return undefined
      return refuse(`skraft G8: the write-rights guard could not judge this call (${error?.message ?? error}); it is refused`)
    }
    if (verdict.allowed) return undefined
    try {
      await audit({ event: 'SessionGuardEvaluated', source: 'copilot-extension', agentName: verdict.agent, decision: 'DENY', code: verdict.code, reason: verdict.reason })
    } catch { /* an audit failure never changes the decision */ }
    return refuse(`skraft G8: ${verdict.reason}`)
  }
}
