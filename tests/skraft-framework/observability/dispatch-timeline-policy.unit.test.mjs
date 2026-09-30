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
  agentAliases: { 'skraft:engineer': 'engineer', engineer: 'engineer' },
}

test('dispatchRecord: stamps a phase agent with its phase, role and attempt', () => {
  const record = dispatchRecord({
    eventType: DISPATCH_STARTED,
    agentName: 'skraft:engineer',
    agentId: 'a-1',
    projectSlug: 'checkout',
    state: { currentPhase: 'DELIVER', retryCount: { DELIVER: 1 } },
    config: CONFIG,
    timestamp: '2026-09-30T10:00:00.000Z',
  })
  assert.deepEqual(record, {
    eventType: 'SubagentStarted', agentName: 'engineer', agentId: 'a-1', projectSlug: 'checkout',
    phase: 'DELIVER', role: 'specialist', attempt: 2, timestamp: '2026-09-30T10:00:00.000Z',
  })
})

test('dispatchRecord: a lens runs in the open phase as a sub-agent, without an attempt', () => {
  const record = dispatchRecord({
    eventType: DISPATCH_STOPPED, agentName: 'cold-reader-lens', projectSlug: 'checkout',
    state: { currentPhase: 'DELIVER' }, config: CONFIG, decision: 'ALLOW', timestamp: 't',
  })
  assert.deepEqual(record, {
    eventType: 'SubagentStopped', agentName: 'cold-reader-lens', projectSlug: 'checkout',
    phase: 'DELIVER', role: 'subagent', decision: 'ALLOW', timestamp: 't',
  })
})

test('dispatchRecord: without a readable state, keeps the agent and drops phase and attempt', () => {
  const record = dispatchRecord({ eventType: DISPATCH_STARTED, agentName: 'cold-reader-lens', state: null, config: {}, timestamp: 't' })
  assert.deepEqual(record, { eventType: 'SubagentStarted', agentName: 'cold-reader-lens', projectSlug: null, phase: null, role: 'subagent', timestamp: 't' })
  const noName = dispatchRecord({ eventType: DISPATCH_STARTED, agentId: '', state: { currentPhase: 'DESIGN', retryCount: 'x' }, config: CONFIG, timestamp: 't' })
  assert.equal(noName.agentName, null)
  assert.equal(noName.agentId, undefined)
  const other = dispatchRecord({ eventType: DISPATCH_STARTED, agentName: 'architect', state: { currentPhase: 'DELIVER' }, config: CONFIG, timestamp: 't' })
  assert.equal(other.phase, 'DESIGN')
  assert.equal(other.attempt, undefined, 'no attempt outside the open phase')
})

test('mutationDurationMs: reads Stryker .NET and StrykerJS elapsed times', () => {
  assert.equal(mutationDurationMs('...\nTime Elapsed 00:02:03.5\n'), 123500)
  assert.equal(mutationDurationMs('INFO MutationTestExecutor Done in 3 minutes 25 seconds.'), 205000)
  assert.equal(mutationDurationMs('Done in 42 seconds.'), 42000)
  assert.equal(mutationDurationMs('Done in 2 minutes.'), 120000)
  assert.equal(mutationDurationMs('Done in no time'), null)
  assert.equal(mutationDurationMs('no timing here'), null)
  assert.equal(mutationDurationMs(undefined), null)
})

const ev = (eventType, agentName, phase, role, timestamp, extra = {}) => ({ eventType, agentName, phase, role, timestamp, projectSlug: 'checkout', ...extra })

test('buildTimeline: splits each phase between its specialist, reviewer, sub-agents and the rest', () => {
  const state = {
    currentPhase: 'DONE',
    phaseHistory: {
      DESIGN: { status: 'done', startedAt: '2026-09-30T10:00:00.000Z', completedAt: '2026-09-30T10:30:00.000Z' },
      DELIVER: { status: 'done', startedAt: '2026-09-30T11:00:00.000Z', completedAt: '2026-09-30T12:00:00.000Z' },
    },
    retryCount: { DESIGN: 1 },
    reworkCount: { DELIVER: 2 },
  }
  const events = [
    ev(DISPATCH_STARTED, 'architect', 'DESIGN', 'specialist', '2026-09-30T10:00:00.000Z'),
    ev(DISPATCH_STOPPED, 'architect', 'DESIGN', 'specialist', '2026-09-30T10:05:00.000Z', { decision: 'BLOCK' }),
    ev(DISPATCH_STOPPED, 'architect', 'DESIGN', 'specialist', '2026-09-30T10:10:00.000Z'),
    ev(DISPATCH_STOPPED, 'architect-reviewer', 'DESIGN', 'reviewer', '2026-09-30T10:11:00.000Z'),
    ev(DISPATCH_STARTED, 'architect-reviewer', 'DESIGN', 'reviewer', '2026-09-30T10:12:00.000Z'),
    ev(DISPATCH_STOPPED, 'architect-reviewer', 'DESIGN', 'reviewer', '2026-09-30T10:20:00.000Z'),
    ev(DISPATCH_STARTED, 'lens', 'DELIVER', 'subagent', '2026-09-30T11:40:00.000Z', { agentId: 'l1' }),
    ev(DISPATCH_STARTED, 'lens', 'DELIVER', 'subagent', '2026-09-30T11:41:00.000Z', { agentId: 'l2' }),
    ev(DISPATCH_STOPPED, 'lens', 'DELIVER', 'subagent', '2026-09-30T11:45:00.000Z', { agentId: 'l2' }),
    ev(DISPATCH_STOPPED, 'lens', 'DELIVER', 'subagent', '2026-09-30T11:50:00.000Z', { agentId: 'l1' }),
    { eventType: 'SessionGuardEvaluated', timestamp: '2026-09-30T11:00:00.000Z' },
    ev(DISPATCH_STARTED, 'engineer', 'DELIVER', 'specialist', 'not a date'),
  ]
  const timeline = buildTimeline({
    state, events, config: CONFIG,
    mutations: [{ ref: 'evidence/a/qg-mutation.stdout', stdout: 'Time Elapsed 00:05:00' }, { ref: 'x', stdout: 'nothing' }],
  })

  const [design, deliver] = timeline.phases
  assert.equal(design.wallMs, 30 * 60000)
  assert.equal(design.attempts, 2)
  // A blocked stop leaves the architect running until its next stop (10 min); the
  // reviewer stop before any reviewer start is unmatched.
  assert.deepEqual(design.specialist, { dispatches: 1, ms: 10 * 60000 })
  assert.deepEqual(design.reviewer, { dispatches: 1, ms: 8 * 60000 })
  assert.equal(design.skillBlocks, 1)
  assert.equal(design.outsideAgentsMs, 12 * 60000)
  assert.deepEqual(design.mutation, { runs: 0, ms: 0, byRef: [] })

  assert.equal(deliver.reworks, 2)
  assert.deepEqual(deliver.subagents, { dispatches: 2, ms: 14 * 60000, byAgent: { lens: { dispatches: 2, ms: 14 * 60000 } } })
  assert.deepEqual(deliver.mutation, { runs: 1, ms: 300000, byRef: [{ ref: 'evidence/a/qg-mutation.stdout', ms: 300000 }] })
  assert.equal(timeline.totalMs, 90 * 60000)
  assert.equal(timeline.unmatchedDispatches, 1)
})

test('buildTimeline: a phase not started yet reports no wall time', () => {
  const timeline = buildTimeline({ state: { currentPhase: 'DESIGN', phaseHistory: { DESIGN: { status: 'inProgress', startedAt: '2026-09-30T10:00:00.000Z' } } } })
  assert.deepEqual(timeline.phases.map(({ phase, status, wallMs, outsideAgentsMs }) => ({ phase, status, wallMs, outsideAgentsMs })), [
    { phase: 'DESIGN', status: 'inProgress', wallMs: null, outsideAgentsMs: null },
  ])
  const pending = buildTimeline({ state: { currentPhase: 'DESIGN' }, config: CONFIG })
  assert.deepEqual(pending.phases.map(({ status, startedAt }) => ({ status, startedAt })), [
    { status: 'pending', startedAt: null }, { status: 'pending', startedAt: null },
  ])
  assert.equal(pending.totalMs, 0)
})
