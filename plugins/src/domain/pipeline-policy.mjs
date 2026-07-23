import { Ok, Err, isOk } from './result.mjs'

// Pure pipeline state machine. Derives the single agent the run expects next and the
// deny-by-default dispatch decision (ADR-004). No IO. Assumes state already passed
// validateState. Distinct from build-time domain/dispatch-policy.mjs — no shared symbol.

export const nextPhaseAfter = (currentPhase, config, skipPhases) => {
  const order = config.phaseOrder
  let index = order.indexOf(currentPhase) + 1
  while (index < order.length && skipPhases.includes(order[index])) {
    index += 1
  }
  return index < order.length ? order[index] : null
}

// The set of agents governed by the phase-order guard: every specialist and reviewer
// declared across the pipeline. Anything NOT in this set (product-layer agents invoked
// top-level, DELIVER workers, arbitrary sub-agents) is UNGOVERNED — the phase-order
// invariant does not apply to it, so it must not be denied for being "out of order".
export const isPipelineAgent = (agent, config) => {
  for (const phase of config.phaseOrder ?? []) {
    const phaseAgents = config.phaseAgents?.[phase]
    if (phaseAgents?.specialist === agent || phaseAgents?.reviewer === agent) return true
  }
  return false
}

export const expectedNextAgent = (state, config) => {
  const { currentPhase, specialistDone, reviewerVerdict, retries, skipPhases } = state

  if (!config.phaseOrder.includes(currentPhase)) {
    return Err({ code: 'INVALID_STATE', reason: `phase ${currentPhase} is not in the published phase order` })
  }
  const phaseAgents = config.phaseAgents?.[currentPhase]
  if (!phaseAgents || typeof phaseAgents.specialist !== 'string' || typeof phaseAgents.reviewer !== 'string') {
    return Err({ code: 'INVALID_STATE', reason: `phase ${currentPhase} has no resolvable agents in the published config` })
  }

  if (!specialistDone) {
    return Ok({ agent: phaseAgents.specialist, stage: 'SPECIALIST', reason: `${currentPhase} specialist must run before its reviewer` })
  }
  if (reviewerVerdict === null) {
    return Ok({ agent: phaseAgents.reviewer, stage: 'REVIEWER', reason: `${currentPhase} reviewer must run before advancing` })
  }
  if (reviewerVerdict === 'CHANGES_REQUESTED') {
    const budget = config.retryBudget ?? 3
    if (retries >= budget) {
      return Err({ code: 'RETRY_EXHAUSTED', reason: `retry budget of ${budget} exhausted for ${currentPhase}; the run must escalate` })
    }
    return Ok({ agent: phaseAgents.specialist, stage: 'RETRY', reason: `${currentPhase} specialist retries within the retry budget` })
  }

  const nextPhase = nextPhaseAfter(currentPhase, config, skipPhases)
  if (nextPhase === null) {
    return Err({ code: 'PIPELINE_COMPLETE', reason: `the pipeline already completed its final phase ${currentPhase}` })
  }
  const nextPhaseAgents = config.phaseAgents?.[nextPhase]
  if (!nextPhaseAgents || typeof nextPhaseAgents.specialist !== 'string') {
    return Err({ code: 'INVALID_STATE', reason: `phase ${nextPhase} has no resolvable specialist agent in the published config` })
  }
  return Ok({ agent: nextPhaseAgents.specialist, stage: 'ADVANCE', reason: `advance to ${nextPhase} specialist` })
}

export const evaluateDispatch = (requestedAgent, state, config) => {
  // Active-pipeline-only: the phase-order invariant governs pipeline agents. An
  // ungoverned agent (product-layer, worker, arbitrary) is allowed unconditionally —
  // it is not part of the sequence, so "out of order" is meaningless for it.
  if (!isPipelineAgent(requestedAgent, config)) {
    return Ok({
      requestedAgent,
      expectedAgent: null,
      stage: 'UNGOVERNED',
      reason: `${requestedAgent} is not a pipeline phase agent; dispatch is not governed by phase order`
    })
  }
  const expected = expectedNextAgent(state, config)
  if (!isOk(expected)) {
    return Err({ code: expected.error.code, requestedAgent, expectedAgent: null, reason: expected.error.reason })
  }
  const { agent: expectedAgent, stage, reason } = expected.value
  if (requestedAgent === expectedAgent) {
    return Ok({ requestedAgent, expectedAgent, stage, reason })
  }
  return Err({
    code: 'OUT_OF_ORDER',
    requestedAgent,
    expectedAgent,
    reason: `out-of-order dispatch: expected ${expectedAgent} to run next, not ${requestedAgent}`
  })
}
