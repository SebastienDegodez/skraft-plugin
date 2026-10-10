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

// ─── Copilot toolCalls batch ────────────────────────────────────────────────

test('a toolCalls batch runs the guards once per call, each with the session context', async () => {
  const sessionGuard = recordingGuard(ALLOW)
  const svc = createPreToolUseCompositeService({ sessionGuard })

  await svc.handle({
    projectSlug: 'proj', sessionId: 'child', toolName: 'stale',
    toolCalls: [
      { toolCallId: 't1', toolName: 'Write', filePath: 'src/A.cs' },
      { toolCallId: 't2', toolName: 'Bash', toolInput: { command: 'ls' } },
    ],
  })
  assert.deepEqual(sessionGuard.calls, [
    { projectSlug: 'proj', sessionId: 'child', toolCallId: 't1', toolName: 'Write', filePath: 'src/A.cs' },
    { projectSlug: 'proj', sessionId: 'child', toolCallId: 't2', toolName: 'Bash', toolInput: { command: 'ls' } },
  ])
})

test('one denied call in a batch denies the batch', async () => {
  const sessionGuard = { handle: async (p) => (p.filePath === 'src/B.cs' ? DENY : ALLOW) }
  const svc = createPreToolUseCompositeService({ sessionGuard })

  const result = await svc.handle({ toolCalls: [{ toolName: 'Write', filePath: 'src/A.cs' }, { toolName: 'Write', filePath: 'src/B.cs' }] })
  assert.equal(result.decision, 'deny')
})

test('a dispatch inside a batch reaches the provenance guard, with the caller of the batch', async () => {
  const provenanceGuard = recordingGuard(ALLOW)
  const svc = createPreToolUseCompositeService({ provenanceGuard })

  await svc.handle({ agentName: 'software-engineer', toolCalls: [{ toolName: 'Read' }, { toolName: 'Agent', requestedAgent: 'contract-testing-worker' }] })
  assert.deepEqual(provenanceGuard.calls, [{ agentName: 'software-engineer', requestedAgent: 'contract-testing-worker' }])
})
