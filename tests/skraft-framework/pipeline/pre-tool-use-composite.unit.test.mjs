import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPreToolUseCompositeService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-composite.mjs'

// The composite fans a single PreToolUse event out to the guards that govern it — the
// provenance guard (every agent dispatch) and the G7/G8 session guard (always) — then
// combines their harness decisions fail-closed (block > deny > allow). The dispatch order
// (G1) and the handoff completeness (G9) are RunPipeline's own checks now.

const recordingGuard = (decision) => {
  const calls = []
  return { calls, handle: async (p) => { calls.push(p); return decision } }
}

const ALLOW = { decision: 'allow' }
const DENY = { decision: 'deny', message: 'outside the dispatch tree' }
const BLOCK = { decision: 'block', message: 'state unreadable' }

test('runs the provenance guard for an agent dispatch, with the caller and the requested agent', async () => {
  const provenance = recordingGuard(ALLOW)
  const svc = createPreToolUseCompositeService({ provenanceGuard: provenance, sessionGuard: recordingGuard(ALLOW) })
  await svc.handle({ agentName: 'skraft-orchestrator', toolInput: { subagentType: 'software-engineer' } })
  assert.deepEqual(provenance.calls, [{ agentName: 'skraft-orchestrator', requestedAgent: 'software-engineer' }])
})

test('skips the provenance guard when there is no requested agent (e.g. a Bash call)', async () => {
  const provenance = recordingGuard(DENY)
  const svc = createPreToolUseCompositeService({ provenanceGuard: provenance, sessionGuard: recordingGuard(ALLOW) })
  assert.deepEqual(await svc.handle({ toolName: 'Bash', projectSlug: 'proj' }), ALLOW)
  assert.deepEqual(provenance.calls, [])
})

test('always runs the session guard with the full payload', async () => {
  const session = recordingGuard(ALLOW)
  const svc = createPreToolUseCompositeService({ sessionGuard: session })
  const payload = { toolName: 'Write', projectSlug: 'proj', toolInput: { path: 'x' } }
  await svc.handle(payload)
  assert.deepEqual(session.calls, [payload])
})

test('a deny wins over an allow; a block wins over a deny', async () => {
  const deny = createPreToolUseCompositeService({ provenanceGuard: recordingGuard(ALLOW), sessionGuard: recordingGuard(DENY) })
  assert.deepEqual(await deny.handle({ requestedAgent: 'a' }), DENY)
  const block = createPreToolUseCompositeService({ provenanceGuard: recordingGuard(DENY), sessionGuard: recordingGuard(BLOCK) })
  assert.deepEqual(await block.handle({ requestedAgent: 'a' }), BLOCK)
})

test('no guards configured yields a safe allow (never undefined)', async () => {
  assert.deepEqual(await createPreToolUseCompositeService().handle(), ALLOW)
})

test('the removed guards are ignored even if a caller still passes them', async () => {
  const dispatchGuard = recordingGuard(BLOCK)
  const handoffGuard = recordingGuard(DENY)
  const svc = createPreToolUseCompositeService({ dispatchGuard, handoffGuard, sessionGuard: recordingGuard(ALLOW) })
  assert.deepEqual(await svc.handle({ projectSlug: 'proj', requestedAgent: 'software-engineer' }), ALLOW)
  assert.deepEqual([dispatchGuard.calls, handoffGuard.calls], [[], []])
})
