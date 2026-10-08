import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHandoffGuardService } from '../../../plugins/skraft-framework/src/application/handoff-guard-service.mjs'

// G9 wires the pure handoff policy to the recorded state and the audit seam.
const T = '.copilot-tracking/skraft-plans/{projectSlug}/'
const CONFIG = {
  phaseOrder: ['DISTILL', 'DELIVER'],
  phaseAgents: {
    DISTILL: { specialist: 'designer', reviewer: 'designer-reviewer' },
    DELIVER: { specialist: 'engineer', reviewer: 'engineer-reviewer' },
  },
  agentArtifacts: { engineer: { inputs: [`${T}details/{date}/test-plan-{story}.md`], outputs: [] } },
}
const STATE = { currentPhase: 'DELIVER', phaseArtifacts: { DISTILL: ['details/2026-09-30/test-plan-42.md'] } }
const clock = { now: () => '2026-09-30T10:00:00.000Z' }

const collecting = () => {
  const entries = []
  return { entries, write: async (entry) => { entries.push(entry) } }
}
const reader = (value) => ({ read: async () => value })

test('denies a dispatch that omits the recorded test plan and audits what is missing', async () => {
  const audit = collecting()
  const guard = createHandoffGuardService({ stateReader: reader(STATE), auditWriter: audit, config: CONFIG, clock })
  const result = await guard.handle({ requestedAgent: 'engineer', projectSlug: 'checkout', prompt: 'Implement story 42' })
  assert.equal(result.decision, 'deny')
  assert.match(result.message, /test-plan-42\.md/)
  assert.deepEqual(audit.entries, [{
    event: 'HandoffEvaluated',
    projectSlug: 'checkout',
    requestedAgent: 'engineer',
    decision: 'DENY',
    code: 'HANDOFF_INCOMPLETE',
    missing: [{ input: `${T}details/{date}/test-plan-{story}.md`, expected: ['details/2026-09-30/test-plan-42.md'] }],
    evaluatedAt: '2026-09-30T10:00:00.000Z',
  }])
})

test('allows a complete dispatch and audits it', async () => {
  const audit = collecting()
  const guard = createHandoffGuardService({ stateReader: reader(STATE), auditWriter: audit, config: CONFIG, clock })
  const result = await guard.handle({ requestedAgent: 'engineer', projectSlug: 'checkout', prompt: 'read details/2026-09-30/test-plan-42.md' })
  assert.deepEqual(result, { decision: 'allow' })
  assert.equal(audit.entries[0].decision, 'ALLOW')
  assert.equal(audit.entries[0].code, 'COMPLETE')
})

test('never reads the state for a non-phase agent or without a pipeline', async () => {
  let reads = 0
  const stateReader = { read: async () => { reads += 1; return STATE } }
  const guard = createHandoffGuardService({ stateReader, auditWriter: collecting(), config: CONFIG, clock })
  assert.deepEqual(await guard.handle({ requestedAgent: 'cold-reader-lens', projectSlug: 'checkout' }), { decision: 'allow' })
  assert.deepEqual(await guard.handle({ requestedAgent: 'engineer' }), { decision: 'allow' })
  assert.equal(reads, 0)
})

test('fails open on an unreadable state, a failing audit or a broken clock', async () => {
  const unreadable = createHandoffGuardService({
    stateReader: { read: async () => { throw new Error('ENOENT') } }, auditWriter: collecting(), config: CONFIG, clock,
  })
  assert.deepEqual(await unreadable.handle({ requestedAgent: 'engineer', projectSlug: 'checkout' }), { decision: 'allow' })

  const failingAudit = createHandoffGuardService({
    stateReader: reader(STATE), auditWriter: { write: async () => { throw new Error('disk full') } }, config: CONFIG, clock,
  })
  assert.equal((await failingAudit.handle({ requestedAgent: 'engineer', projectSlug: 'checkout', prompt: '' })).decision, 'deny')

  const audit = collecting()
  const brokenClock = createHandoffGuardService({
    stateReader: reader(STATE), auditWriter: audit, config: CONFIG, clock: { now: () => { throw new Error('no clock') } },
  })
  await brokenClock.handle({ requestedAgent: 'engineer', projectSlug: 'checkout', prompt: '' })
  assert.match(audit.entries[0].evaluatedAt, /^\d{4}-\d{2}-\d{2}T/)
})

test('fails open when the recorded state is not an object', async () => {
  const guard = createHandoffGuardService({ stateReader: reader('not a state'), auditWriter: collecting(), config: CONFIG, clock })
  assert.equal((await guard.handle({ requestedAgent: 'engineer', projectSlug: 'checkout', prompt: '' })).decision, 'allow')
})
