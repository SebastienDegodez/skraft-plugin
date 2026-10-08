import { dispatchRecord, DISPATCH_STARTED, DISPATCH_STOPPED } from '../domain/dispatch-timeline-policy.mjs'

// Dispatch journal (observability). Wraps the SubagentStart and SubagentStop services
// so every sub-agent start and stop leaves one audit line — agent, phase, pipeline
// role, attempt, timestamp — whatever the wrapped guard decides. `state.mjs timeline`
// reads these lines back. Fail-open (ADR-006): the journal never changes a decision
// and never throws; an unreadable state only drops the phase and attempt.

const safeNow = (clock) => {
  try { return clock.now() } catch { return new Date().toISOString() }
}

const decisionOf = (result) => {
  const decision = result?.decision
  return typeof decision === 'string' ? decision.toUpperCase() : 'ALLOW'
}

export const createDispatchJournal = ({ auditWriter, stateReader, config, clock }) => {
  const record = async (eventType, payload = {}, result) => {
    try {
      let state = null
      if (stateReader && payload.projectSlug) {
        state = await stateReader.read(payload.projectSlug).catch(() => null)
      }
      await auditWriter.write(dispatchRecord({
        eventType,
        agentName: payload.agentName,
        agentId: payload.agentId,
        projectSlug: payload.projectSlug,
        state,
        config,
        ...(eventType === DISPATCH_STOPPED ? { decision: decisionOf(result) } : {}),
        timestamp: safeNow(clock),
      }))
    } catch { /* journal failure must never reach the harness */ }
  }

  const journaled = (service, eventType) => ({
    handle: async (payload = {}) => {
      if (eventType === DISPATCH_STARTED) await record(eventType, payload)
      const result = await service.handle(payload)
      if (eventType === DISPATCH_STOPPED) await record(eventType, payload, result)
      return result
    },
  })

  return {
    started: (service) => journaled(service, DISPATCH_STARTED),
    stopped: (service) => journaled(service, DISPATCH_STOPPED),
  }
}
