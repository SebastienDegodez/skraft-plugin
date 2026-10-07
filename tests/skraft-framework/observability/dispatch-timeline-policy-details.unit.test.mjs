import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTimeline,
  dispatchRecord,
  mutationDurationMs,
  DISPATCH_STARTED,
  DISPATCH_STOPPED,
} from '../../../plugins/skraft-framework/src/domain/dispatch-timeline-policy.mjs'

const CONFIG = {
  phaseOrder: ['DESIGN', 'DELIVER'],
  phaseAgents: {
    DESIGN: { specialist: 'architect', reviewer: 'architect-reviewer' },
    DELIVER: { specialist: 'engineer', reviewer: 'engineer-reviewer' },
  },
}

const T = (minute) => `2026-09-30T11:${String(minute).padStart(2, '0')}:00.000Z`
const ev = (eventType, agentName, minute, extra = {}) => ({ eventType, agentName, phase: 'DELIVER', role: 'subagent', timestamp: T(minute), ...extra })
const deliverState = { phaseHistory: { DELIVER: { status: 'done', startedAt: T(0), completedAt: T(59) } } }
const deliverOf = (events) => buildTimeline({ state: deliverState, events, config: { phaseOrder: ['DELIVER'] } })

test('dispatchRecord: a non-string currentPhase is no phase', () => {
  const record = dispatchRecord({ eventType: DISPATCH_STARTED, agentName: 'lens', state: { currentPhase: 5 }, config: CONFIG, timestamp: 't' })
  assert.equal(record.phase, null)
})

test('pairing: a stop without an agent id closes the named start even when the start had one', () => {
  const timeline = deliverOf([ev(DISPATCH_STARTED, 'lens', 10, { agentId: 'x' }), ev(DISPATCH_STOPPED, 'lens', 15)])
  assert.equal(timeline.unmatchedDispatches, 0)
  assert.deepEqual(timeline.phases[0].subagents.byAgent, { lens: { dispatches: 1, ms: 5 * 60000 } })
})

test('pairing: matching agent ids win over differing agent names', () => {
  const timeline = deliverOf([ev(DISPATCH_STARTED, 'lens-a', 10, { agentId: '1' }), ev(DISPATCH_STOPPED, 'lens-b', 12, { agentId: '1' })])
  assert.equal(timeline.unmatchedDispatches, 0)
  assert.deepEqual(timeline.phases[0].subagents.byAgent, { 'lens-a': { dispatches: 1, ms: 2 * 60000 } })
})

test('pairing: a stop closes the start carrying its own agent id, not the earliest one', () => {
  const timeline = deliverOf([
    ev(DISPATCH_STARTED, 'lens-a', 10, { agentId: '1' }),
    ev(DISPATCH_STARTED, 'lens-b', 11, { agentId: '2' }),
    ev(DISPATCH_STOPPED, 'lens-b', 14, { agentId: '2' }),
  ])
  assert.deepEqual(timeline.phases[0].subagents.byAgent, { 'lens-b': { dispatches: 1, ms: 3 * 60000 } })
  assert.equal(timeline.unmatchedDispatches, 1, 'lens-a is still open')
})

test('pairing: without ids a stop closes the start of the same name', () => {
  const timeline = deliverOf([ev(DISPATCH_STARTED, 'lens-a', 10), ev(DISPATCH_STARTED, 'lens-b', 11), ev(DISPATCH_STOPPED, 'lens-b', 14)])
  assert.deepEqual(timeline.phases[0].subagents.byAgent, { 'lens-b': { dispatches: 1, ms: 3 * 60000 } })
  assert.equal(timeline.unmatchedDispatches, 1)
})

test('mutationDurationMs: Stryker .NET format edge cases', () => {
  assert.equal(mutationDurationMs('Time Elapsed   00:01:00'), 60000)
  assert.equal(mutationDurationMs('Time Elapsed 00:00:01.25'), 1250)
  assert.equal(mutationDurationMs('Time Elapsed 01:00:00'), 3600000)
  assert.equal(mutationDurationMs('Time Elapsed 02:03:04'), ((2 * 60 + 3) * 60 + 4) * 1000)
})

test('mutationDurationMs: StrykerJS format edge cases', () => {
  assert.equal(mutationDurationMs('Done in  3 minutes'), 180000)
  assert.equal(mutationDurationMs('Done in 12 minutes'), 720000)
  assert.equal(mutationDurationMs('Done in 3  minutes'), 180000)
  assert.equal(mutationDurationMs('Done in 1 minute'), 60000)
  assert.equal(mutationDurationMs('Done in 1 minute and  5 seconds'), 65000)
  assert.equal(mutationDurationMs('Done in 1 minute and 5 seconds'), 65000)
  assert.equal(mutationDurationMs('Done in 5  seconds'), 5000)
  assert.equal(mutationDurationMs('Done in 1 second'), 1000)
  assert.equal(mutationDurationMs('Done in 12 seconds'), 12000)
})

test('buildTimeline: an empty phaseOrder falls back to the phase history', () => {
  const timeline = buildTimeline({ state: deliverState, config: { phaseOrder: [] } })
  assert.deepEqual(timeline.phases.map(({ phase }) => phase), ['DELIVER'])
})

test('buildTimeline: no state at all', () => {
  assert.deepEqual(buildTimeline({}), { phases: [], totalMs: 0, unmatchedDispatches: 0 })
  const timeline = buildTimeline({ config: CONFIG })
  assert.deepEqual(timeline.phases.map(({ phase, status, attempts, reworks }) => ({ phase, status, attempts, reworks })), [
    { phase: 'DESIGN', status: 'pending', attempts: 0, reworks: 0 },
    { phase: 'DELIVER', status: 'pending', attempts: 0, reworks: 0 },
  ])
})

test('buildTimeline: a wall time needs both a start and a completion', () => {
  const timeline = buildTimeline({ state: { phaseHistory: { DELIVER: { status: 'done', completedAt: T(30) } } } })
  assert.equal(timeline.phases[0].wallMs, null)
  assert.equal(timeline.phases[0].completedAt, T(30))
  assert.equal(timeline.totalMs, 0)
})

test('buildTimeline: a non-string timestamp is no time', () => {
  const timeline = buildTimeline({ state: { phaseHistory: { DELIVER: { status: 'done', startedAt: 2026, completedAt: T(30) } } } })
  assert.equal(timeline.phases[0].wallMs, null)
  assert.equal(timeline.phases[0].attempts, 0)
})

test('buildTimeline: a start never stopped counts as unmatched', () => {
  assert.equal(deliverOf([ev(DISPATCH_STARTED, 'lens', 10)]).unmatchedDispatches, 1)
})

test('buildTimeline: skill blocks are blocked stops of this phase only', () => {
  const timeline = buildTimeline({
    state: { phaseHistory: { DESIGN: { startedAt: T(0), completedAt: T(5) }, DELIVER: { startedAt: T(5), completedAt: T(9) } } },
    config: CONFIG,
    events: [
      ev(DISPATCH_STARTED, 'architect', 1, { phase: 'DESIGN', decision: 'BLOCK' }),
      ev(DISPATCH_STOPPED, 'engineer', 6, { phase: 'DELIVER', decision: 'BLOCK' }),
    ],
  })
  assert.deepEqual(timeline.phases.map(({ skillBlocks }) => skillBlocks), [0, 1])
})
