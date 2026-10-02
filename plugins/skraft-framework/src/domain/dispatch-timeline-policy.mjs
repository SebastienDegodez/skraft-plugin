import { phaseRoleOf } from './pipeline-policy.mjs'
import { canonicalAgentName } from './instruction-policy.mjs'

// Pure dispatch-timeline policy. No IO. Two jobs:
//   1. dispatchRecord — the audit line SubagentStart / SubagentStop write for every
//      sub-agent, stamped with the phase it runs in, its pipeline role and attempt.
//   2. buildTimeline — per phase, where the wall-clock time went: specialist,
//      reviewer, other sub-agents (lenses, workers), the rest (orchestrator turns and
//      human checkpoints), attempts, skill-compliance blocks and mutation runs.

export const DISPATCH_STARTED = 'SubagentStarted'
export const DISPATCH_STOPPED = 'SubagentStopped'

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// The phase a sub-agent runs in is the phase open when it starts; its role is its
// pipeline role, or `subagent` for a lens, worker or any agent no phase declares.
// The attempt counts the reviewer retries already spent on that phase.
export const dispatchRecord = ({ eventType, agentName, agentId, projectSlug, state, config, decision, timestamp }) => {
  const canonical = canonicalAgentName(agentName, config) ?? agentName ?? null
  const currentPhase = isPlainObject(state) && typeof state.currentPhase === 'string' ? state.currentPhase : null
  const target = canonical ? phaseRoleOf(canonical, config ?? {}) : null
  const role = target ? target.role : 'subagent'
  const phase = target?.phase ?? currentPhase
  const retries = isPlainObject(state?.retryCount) && Number.isInteger(state.retryCount[phase]) ? state.retryCount[phase] : 0
  return {
    eventType,
    agentName: canonical,
    ...(typeof agentId === 'string' && agentId.length > 0 ? { agentId } : {}),
    projectSlug: projectSlug ?? null,
    phase,
    role,
    ...(target && phase === currentPhase ? { attempt: retries + 1 } : {}),
    ...(decision ? { decision } : {}),
    timestamp,
  }
}

const epochOf = (value) => {
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(ms) ? ms : null
}

// Each stop closes the earliest open start of the same agent instance: the harness
// agent id when both events carry one, else the agent name. Parallel lenses of one
// name pair first-in, first-out. A blocked stop closes nothing: the agent goes on.
const pairDispatches = (events) => {
  const open = []
  const pairs = []
  let unmatched = 0
  for (const event of events) {
    if (event.eventType === DISPATCH_STARTED) {
      open.push(event)
      continue
    }
    if (event.decision === 'BLOCK') continue
    const index = open.findIndex((start) => (start.agentId && event.agentId
      ? start.agentId === event.agentId
      : start.agentName === event.agentName))
    if (index === -1) {
      unmatched += 1
      continue
    }
    const [start] = open.splice(index, 1)
    pairs.push({ start, stop: event, ms: Math.max(0, epochOf(event.timestamp) - epochOf(start.timestamp)) })
  }
  return { pairs, unmatched: unmatched + open.length }
}

const emptyBucket = () => ({ dispatches: 0, ms: 0 })

// Stryker .NET prints `Time Elapsed 00:01:23.45`; StrykerJS prints
// `Done in 3 minutes 25 seconds` (or `Done in 42 seconds`). Null when neither appears.
export const mutationDurationMs = (stdout) => {
  if (typeof stdout !== 'string') return null
  const dotnet = stdout.match(/Time Elapsed\s+(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/i)
  if (dotnet) {
    return Math.round(((Number(dotnet[1]) * 60 + Number(dotnet[2])) * 60 + Number(dotnet[3])) * 1000)
  }
  const js = stdout.match(/Done in\s+(?:(\d+)\s+minutes?)?\s*(?:and\s+)?(?:(\d+)\s+seconds?)?/i)
  if (js && (js[1] !== undefined || js[2] !== undefined)) {
    return (Number(js[1] ?? 0) * 60 + Number(js[2] ?? 0)) * 1000
  }
  return null
}

// state   — the validated pipeline state (phaseHistory, retryCount, reworkCount)
// events  — audit records of this project, in log order
// mutations — [{ ref, stdout }] captured mutation outputs, phase DELIVER
export const buildTimeline = ({ state, events = [], config = {}, mutations = [] }) => {
  const order = Array.isArray(config.phaseOrder) && config.phaseOrder.length > 0
    ? config.phaseOrder
    : Object.keys(state?.phaseHistory ?? {})
  const dispatches = events.filter((event) =>
    isPlainObject(event)
    && (event.eventType === DISPATCH_STARTED || event.eventType === DISPATCH_STOPPED)
    && epochOf(event.timestamp) !== null)
  const { pairs, unmatched } = pairDispatches(dispatches)

  const phases = order.map((phase) => {
    const history = state?.phaseHistory?.[phase] ?? {}
    const startedMs = epochOf(history.startedAt)
    const completedMs = epochOf(history.completedAt)
    const wallMs = startedMs !== null && completedMs !== null ? Math.max(0, completedMs - startedMs) : null
    const buckets = { specialist: emptyBucket(), reviewer: emptyBucket(), subagent: emptyBucket() }
    const byAgent = {}
    for (const { start, ms } of pairs.filter(({ start }) => start.phase === phase)) {
      const bucket = buckets[start.role] ?? buckets.subagent
      bucket.dispatches += 1
      bucket.ms += ms
      if (bucket === buckets.subagent) {
        const agent = (byAgent[start.agentName] ??= emptyBucket())
        agent.dispatches += 1
        agent.ms += ms
      }
    }
    const skillBlocks = dispatches.filter((event) =>
      event.eventType === DISPATCH_STOPPED && event.phase === phase && event.decision === 'BLOCK').length
    const inAgentsMs = buckets.specialist.ms + buckets.reviewer.ms
    const phaseMutations = phase === 'DELIVER'
      ? mutations.map(({ ref, stdout }) => ({ ref, ms: mutationDurationMs(stdout) })).filter(({ ms }) => ms !== null)
      : []
    return {
      phase,
      status: history.status ?? 'pending',
      startedAt: history.startedAt ?? null,
      completedAt: history.completedAt ?? null,
      wallMs,
      attempts: startedMs === null ? 0 : (state?.retryCount?.[phase] ?? 0) + 1,
      reworks: state?.reworkCount?.[phase] ?? 0,
      specialist: buckets.specialist,
      reviewer: buckets.reviewer,
      subagents: { ...buckets.subagent, byAgent },
      skillBlocks,
      outsideAgentsMs: wallMs === null ? null : Math.max(0, wallMs - inAgentsMs),
      mutation: { runs: phaseMutations.length, ms: phaseMutations.reduce((sum, { ms }) => sum + ms, 0), byRef: phaseMutations },
    }
  })

  const totalMs = phases.reduce((sum, { wallMs }) => sum + (wallMs ?? 0), 0)
  return { phases, totalMs, unmatchedDispatches: unmatched }
}
