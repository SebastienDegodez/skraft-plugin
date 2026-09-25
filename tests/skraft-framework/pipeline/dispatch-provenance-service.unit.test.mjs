import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDispatchProvenanceService } from '../../../plugins/skraft-framework/src/application/dispatch-provenance-service.mjs'

const CONFIG = { agentAliases: { a: 'a', b: 'b' }, agentDispatchers: { b: 'a' } }
const clock = { now: () => '2026-09-23T00:00:00.000Z' }

test('a refusal is audited and denies; an allowed dispatch writes nothing', async () => {
  const entries = []
  const service = createDispatchProvenanceService({ config: CONFIG, auditWriter: { write: async (e) => { entries.push(e) } }, clock })
  assert.equal((await service.handle({ agentName: 'a', requestedAgent: 'b' })).decision, 'allow')
  assert.deepEqual(entries, [])
  const refused = await service.handle({ agentName: 'b', requestedAgent: 'b' })
  assert.equal(refused.decision, 'deny')
  assert.deepEqual(entries, [{
    event: 'DispatchProvenanceEvaluated', callerAgent: 'b', requestedAgent: 'b', decision: 'DENY',
    code: 'SELF_DISPATCH', reason: 'b dispatches itself; do the work, or dispatch the agent that owns it',
    evaluatedAt: '2026-09-23T00:00:00.000Z',
  }])
})

test('a failing audit still denies; a failing policy input allows', async () => {
  const failingWriter = { write: async () => { throw new Error('disk full') } }
  const service = createDispatchProvenanceService({ config: CONFIG, auditWriter: failingWriter, clock })
  assert.equal((await service.handle({ agentName: 'b', requestedAgent: 'b' })).decision, 'deny')
  const broken = createDispatchProvenanceService({ config: { get agentAliases() { throw new Error('boom') } }, auditWriter: failingWriter, clock })
  assert.equal((await broken.handle({ agentName: 'a', requestedAgent: 'b' })).decision, 'allow')
})
