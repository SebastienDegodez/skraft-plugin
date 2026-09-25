import { Ok, Err } from './result.mjs'
import { canonicalAgentName } from './instruction-policy.mjs'

// Pure pipeline dispatch policy. No IO. Decides whether a requested agent may run
// now, from the dispatch projection of state.json (see state-schema.projectDispatchState)
// and the published config (phaseOrder, phaseAgents). Distinct from build-time
// domain/dispatch-policy.mjs — no shared symbol.

export const nextPhaseAfter = (currentPhase, config) => {
  const order = config.phaseOrder
  const index = order.indexOf(currentPhase) + 1
  return index < order.length ? order[index] : null
}

// The phase and role of a pipeline agent, or null for an agent no phase declares.
export const phaseRoleOf = (agent, config) => {
  const canonical = canonicalAgentName(agent, config)
  if (!canonical) return null
  for (const phase of config.phaseOrder ?? []) {
    const phaseAgents = config.phaseAgents?.[phase]
    if (canonicalAgentName(phaseAgents?.specialist, config) === canonical) return { phase, role: 'specialist' }
    if (canonicalAgentName(phaseAgents?.reviewer, config) === canonical) return { phase, role: 'reviewer' }
  }
  return null
}

// The set of agents governed by the phase-order guard: every specialist and reviewer
// declared across the pipeline. Anything else (product-layer agents, DELIVER workers,
// lenses, arbitrary sub-agents) is ungoverned and never denied for being "out of order".
export const isPipelineAgent = (agent, config) => phaseRoleOf(agent, config) !== null

// What the current phase needs next: its specialist until it recorded an artefact,
// then its reviewer until a verdict, then a transition.
const pendingStep = (dispatchState, phaseAgents) => {
  if (!dispatchState.specialistDone) return { agent: phaseAgents.specialist, action: 'run its specialist' }
  if (phaseAgents.reviewer && dispatchState.reviewerVerdict !== 'APPROVED') {
    return { agent: phaseAgents.reviewer, action: 'run its reviewer' }
  }
  return { agent: null, action: 'advance it with state.mjs transition' }
}

// G1. A pipeline agent may run only inside the phase currently open: its specialist at
// any point of that phase (first run, retry, ADR ratification), its reviewer once the
// specialist recorded an artefact. Agents of any other phase wait for the transition.
export const evaluateDispatch = (requestedAgent, dispatchState, config) => {
  const target = phaseRoleOf(requestedAgent, config)
  if (!target) {
    return Ok({
      requestedAgent,
      expectedAgent: null,
      stage: 'UNGOVERNED',
      reason: `${requestedAgent} is not a pipeline phase agent; dispatch is not governed by phase order`
    })
  }

  const { currentPhase } = dispatchState
  if (currentPhase === 'DONE') {
    return Err({ code: 'PIPELINE_COMPLETE', requestedAgent, expectedAgent: null, reason: 'the pipeline is DONE; no phase agent runs' })
  }
  const phaseAgents = config.phaseAgents?.[currentPhase]
  if (!config.phaseOrder?.includes(currentPhase) || typeof phaseAgents?.specialist !== 'string') {
    return Err({ code: 'INVALID_STATE', requestedAgent, expectedAgent: null, reason: `phase ${currentPhase} is not in the published phase order` })
  }

  const pending = pendingStep(dispatchState, phaseAgents)
  const outOfOrder = (why) => Err({
    code: 'OUT_OF_ORDER',
    requestedAgent,
    expectedAgent: pending.agent,
    reason: `out-of-order dispatch of ${requestedAgent}: ${why}; ${currentPhase} must ${pending.action}${pending.agent ? ` (${pending.agent})` : ''} first`
  })

  if (target.phase !== currentPhase) return outOfOrder(`it belongs to ${target.phase} while ${currentPhase} is open`)
  if (target.role === 'reviewer' && !dispatchState.specialistDone) return outOfOrder('its specialist has recorded no artefact yet')

  const stage = target.role === 'reviewer' ? 'REVIEWER'
    : dispatchState.reviewerVerdict === 'CHANGES_REQUESTED' ? 'RETRY' : 'SPECIALIST'
  return Ok({ requestedAgent, expectedAgent: phaseAgents[target.role], stage, reason: `${requestedAgent} runs as ${currentPhase} ${target.role}` })
}

// G6. What the orchestrator must record after a phase agent returns. Hooks fire before
// the orchestrator writes anything, so the reminder is derived from the returning agent's
// role, never from a state it has not written yet. Null for a non-phase agent or a phase
// that is not open.
export const continuationAfter = (finishedAgent, dispatchState, config) => {
  const target = phaseRoleOf(finishedAgent, config)
  const { currentPhase } = dispatchState
  if (!target || target.phase !== currentPhase) return null
  const phaseAgents = config.phaseAgents[currentPhase]
  const next = nextPhaseAfter(currentPhase, config) ?? 'DONE'
  const cli = 'node "$SKRAFT_PLUGIN_ROOT/src/cli/state.mjs"'

  if (target.role === 'specialist') {
    if (!phaseAgents.reviewer) {
      return {
        kind: 'CLOSE',
        context: `SKRAFT G6 — ${finishedAgent} returned for ${currentPhase}. Record each artefact it produced with \`${cli} record-artifact --phase ${currentPhase} --path <tracking-relative path>\`, then close the phase with \`${cli} close-phase --phase ${currentPhase} --verdict APPROVED\` (next: ${next}).`
      }
    }
    return {
      kind: 'REVIEW',
      context: `SKRAFT G6 — ${finishedAgent} returned for ${currentPhase}. Record each artefact it produced with \`${cli} record-artifact --phase ${currentPhase} --path <tracking-relative path>\`, then dispatch ${phaseAgents.reviewer}.`
    }
  }

  const exhausted = dispatchState.retries >= dispatchState.maxRetries
  return {
    kind: 'VERDICT',
    context: `SKRAFT G6 — ${finishedAgent} returned for ${currentPhase}. Record its review file with \`${cli} record-review-artifact --phase ${currentPhase} --path <tracking-relative path>\`, then its verdict: APPROVED → \`record-verdict --verdict APPROVED\` and \`transition --to ${next}\`; NEEDS_REWORK → \`record-verdict --verdict CHANGES_REQUESTED\`, ${exhausted ? `retry budget exhausted (${dispatchState.retries}/${dispatchState.maxRetries}): stop and escalate to the user` : `\`incr-retry\` and re-dispatch ${phaseAgents.specialist} with the findings`}; REJECTED → \`record-verdict --verdict CHANGES_REQUESTED\` and stop.`
  }
}

// Who may dispatch whom, from the dispatch tree the descriptors declare (dispatched_by,
// published as config.agentDispatchers). Claude Code ignores a subagent definition's
// Agent(...) allowlist, so this is where the tree is enforced. Judged only when the
// caller is one of this plugin's agents: an unknown caller or an agent without a
// declared dispatcher is left alone.
export const evaluateDispatchProvenance = (callerAgent, requestedAgent, config) => {
  const known = new Set(Object.values(config?.agentAliases ?? {}))
  const caller = canonicalAgentName(callerAgent, config)
  const requested = canonicalAgentName(requestedAgent, config)
  if (!caller || !requested || !known.has(caller)) return Ok({ reason: 'caller not judged' })
  if (caller === requested) {
    return Err({ code: 'SELF_DISPATCH', reason: `${caller} dispatches itself; do the work, or dispatch the agent that owns it` })
  }
  const dispatcher = config.agentDispatchers?.[requested]
  if (!dispatcher || canonicalAgentName(dispatcher, config) === caller) return Ok({ reason: 'declared dispatch' })
  return Err({
    code: 'FOREIGN_DISPATCHER',
    reason: `${requested} is dispatched by ${canonicalAgentName(dispatcher, config)}, not ${caller}`,
  })
}
