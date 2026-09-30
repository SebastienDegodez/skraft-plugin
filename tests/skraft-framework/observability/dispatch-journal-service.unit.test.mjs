import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDispatchJournal } from '../../../plugins/skraft-framework/src/application/dispatch-journal-service.mjs'

const CONFIG = {
  phaseOrder: ['DELIVER'],
  phaseAgents: { DELIVER: { specialist: 'engineer', reviewer: 'engineer-reviewer' } },
}
const clock = { now: () => '2026-09-30T10:00:00.000Z' }
const collecting = () => {
  const entries = []
  return { entries, write: async (entry) => { entries.push(entry) } }
}
const service = (result) => ({ calls: [], handle: async function (payload) { this.calls.push(payload); return result } })

test('journals a start before the wrapped guard and passes its decision through', async () => {
  const audit = collecting()
  const order = []
  const wrapped = { handle: async () => { order.push(`guard:${audit.entries.length}`); return { decision: 'additionalContext', context: 'x' } } }
  const journal = createDispatchJournal({
    auditWriter: audit, config: CONFIG, clock,
    stateReader: { read: async () => ({ currentPhase: 'DELIVER', retryCount: { DELIVER: 1 } }) },
  })
  const result = await journal.started(wrapped).handle({ agentName: 'engineer', agentId: 'a1', projectSlug: 'checkout' })
  assert.deepEqual(result, { decision: 'additionalContext', context: 'x' })
  assert.deepEqual(order, ['guard:1'])
  assert.deepEqual(audit.entries, [{
    eventType: 'SubagentStarted', agentName: 'engineer', agentId: 'a1', projectSlug: 'checkout',
    phase: 'DELIVER', role: 'specialist', attempt: 2, timestamp: '2026-09-30T10:00:00.000Z',
  }])
})

test('journals a stop after the wrapped guard, with its decision', async () => {
  const audit = collecting()
  const journal = createDispatchJournal({ auditWriter: audit, config: CONFIG, clock })
  const blocked = await journal.stopped(service({ decision: 'block', message: 'skill missing' })).handle({ agentName: 'engineer' })
  await journal.stopped(service(undefined)).handle()
  assert.equal(blocked.decision, 'block')
  assert.deepEqual(audit.entries.map(({ eventType, decision, phase }) => ({ eventType, decision, phase })), [
    { eventType: 'SubagentStopped', decision: 'BLOCK', phase: 'DELIVER' },
    { eventType: 'SubagentStopped', decision: 'ALLOW', phase: null },
  ])
})

test('an unreadable state, a failing audit or a broken clock never changes the decision', async () => {
  const audit = collecting()
  const journal = createDispatchJournal({
    auditWriter: audit, config: CONFIG, clock: { now: () => { throw new Error('clock') } },
    stateReader: { read: async () => { throw new Error('ENOENT') } },
  })
  const result = await journal.started(service({ decision: 'allow' })).handle({ agentName: 'cold-reader-lens', projectSlug: 'checkout' })
  assert.deepEqual(result, { decision: 'allow' })
  assert.equal(audit.entries[0].phase, null)
  assert.match(audit.entries[0].timestamp, /^\d{4}-\d{2}-\d{2}T/)

  const failing = createDispatchJournal({ auditWriter: { write: async () => { throw new Error('disk') } }, config: CONFIG, clock })
  assert.deepEqual(await failing.stopped(service({ decision: 'allow' })).handle({ agentName: 'engineer' }), { decision: 'allow' })
})
