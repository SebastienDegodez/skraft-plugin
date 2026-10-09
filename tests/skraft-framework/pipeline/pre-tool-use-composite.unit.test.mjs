import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPreToolUseCompositeService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-composite.mjs'

// The composite fans a single PreToolUse event out to the two guards that govern it —
// G1 dispatch-order (only for orchestrator-tracked agent dispatches) and G7 session
// guard (always) — then combines their harness decisions fail-closed (block > deny > allow).

const recordingGuard = (decision) => {
  const calls = []
  return { calls, handle: async (p) => { calls.push(p); return decision } }
}

const ALLOW = { decision: 'allow' }
const DENY = { decision: 'deny', message: 'out of order' }
const BLOCK = { decision: 'block', message: 'state unreadable' }

// ─── G1 gating ──────────────────────────────────────────────────────────────

test('runs the dispatch guard only when projectSlug AND requestedAgent are present', async () => {
  const dispatchGuard = recordingGuard(ALLOW)
  const sessionGuard = recordingGuard(ALLOW)
  const svc = createPreToolUseCompositeService({ dispatchGuard, sessionGuard })

  await svc.handle({ projectSlug: 'proj', requestedAgent: 'solution-architect' })
  assert.equal(dispatchGuard.calls.length, 1)
  assert.deepEqual(dispatchGuard.calls[0], { requestedAgent: 'solution-architect', projectSlug: 'proj' })
})

test('skips the dispatch guard when projectSlug is absent (standalone agent — not blocked)', async () => {
  const dispatchGuard = recordingGuard(BLOCK)
  const sessionGuard = recordingGuard(ALLOW)
  const svc = createPreToolUseCompositeService({ dispatchGuard, sessionGuard })

  const result = await svc.handle({ requestedAgent: 'backlog-planner' })
  assert.equal(dispatchGuard.calls.length, 0, 'no projectSlug => G1 must not run (no pipeline context)')
  assert.equal(result.decision, 'allow')
})

test('skips the dispatch guard when there is no requestedAgent (e.g. a Bash call)', async () => {
  const dispatchGuard = recordingGuard(BLOCK)
  const sessionGuard = recordingGuard(ALLOW)
  const svc = createPreToolUseCompositeService({ dispatchGuard, sessionGuard })

  await svc.handle({ projectSlug: 'proj', toolName: 'Bash', toolInput: { command: 'ls' } })
  assert.equal(dispatchGuard.calls.length, 0)
})

test('derives requestedAgent from toolInput.subagentType when not given explicitly', async () => {
  const dispatchGuard = recordingGuard(ALLOW)
  const sessionGuard = recordingGuard(ALLOW)
  const svc = createPreToolUseCompositeService({ dispatchGuard, sessionGuard })

  await svc.handle({ projectSlug: 'proj', toolName: 'Agent', toolInput: { subagentType: 'acceptance-designer' } })
  assert.equal(dispatchGuard.calls.length, 1)
  assert.equal(dispatchGuard.calls[0].requestedAgent, 'acceptance-designer')
})

// ─── session guard always runs ────────────────────────────────────────────────

test('always runs the session guard with the full payload', async () => {
  const dispatchGuard = recordingGuard(ALLOW)
  const sessionGuard = recordingGuard(ALLOW)
  const svc = createPreToolUseCompositeService({ dispatchGuard, sessionGuard })

  const payload = { toolName: 'Bash', toolInput: { command: 'echo hi' } }
  await svc.handle(payload)
  assert.equal(sessionGuard.calls.length, 1)
  assert.deepEqual(sessionGuard.calls[0], payload)
})

// ─── fail-closed combination (block > deny > allow) ───────────────────────────

test('a session-guard deny wins over a dispatch-guard allow', async () => {
  const svc = createPreToolUseCompositeService({
    dispatchGuard: recordingGuard(ALLOW),
    sessionGuard: recordingGuard(DENY),
  })
  const result = await svc.handle({ projectSlug: 'proj', requestedAgent: 'solution-architect' })
  assert.equal(result.decision, 'deny')
  assert.equal(result.message, 'out of order')
})

test('a dispatch-guard block wins over a session-guard deny (block > deny)', async () => {
  const svc = createPreToolUseCompositeService({
    dispatchGuard: recordingGuard(BLOCK),
    sessionGuard: recordingGuard(DENY),
  })
  const result = await svc.handle({ projectSlug: 'proj', requestedAgent: 'solution-architect' })
  assert.equal(result.decision, 'block')
})

test('all-allow yields allow', async () => {
  const svc = createPreToolUseCompositeService({
    dispatchGuard: recordingGuard(ALLOW),
    sessionGuard: recordingGuard(ALLOW),
  })
  const result = await svc.handle({ projectSlug: 'proj', requestedAgent: 'solution-architect' })
  assert.equal(result.decision, 'allow')
})

test('no guards configured yields a safe allow (never undefined)', async () => {
  const svc = createPreToolUseCompositeService({})
  const result = await svc.handle({ toolName: 'Bash' })
  assert.equal(result.decision, 'allow')
})

// ─── G9 handoff guard ─────────────────────────────────────────────────────────

test('runs the handoff guard with the dispatch prompt only for a tracked agent dispatch', async () => {
  const handoffGuard = recordingGuard(ALLOW)
  const svc = createPreToolUseCompositeService({ sessionGuard: recordingGuard(ALLOW), handoffGuard })

  await svc.handle({ projectSlug: 'proj', toolName: 'Agent', toolInput: { subagentType: 'software-engineer', prompt: 'test-plan-42.md' } })
  await svc.handle({ toolName: 'Agent', toolInput: { subagentType: 'software-engineer', prompt: 'no pipeline' } })
  await svc.handle({ projectSlug: 'proj', toolName: 'Bash', toolInput: { command: 'ls' } })
  assert.deepEqual(handoffGuard.calls, [{ requestedAgent: 'software-engineer', projectSlug: 'proj', prompt: 'test-plan-42.md' }])
})

test('a handoff refusal denies the dispatch even when every other guard allows', async () => {
  const svc = createPreToolUseCompositeService({
    dispatchGuard: recordingGuard(ALLOW),
    sessionGuard: recordingGuard(ALLOW),
    handoffGuard: recordingGuard({ decision: 'deny', message: 'omits the test plan' }),
  })
  const result = await svc.handle({ projectSlug: 'proj', requestedAgent: 'software-engineer' })
  assert.deepEqual(result, { decision: 'deny', message: 'omits the test plan' })
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

test('a dispatch inside a batch reaches the dispatch guards', async () => {
  const dispatchGuard = recordingGuard(ALLOW)
  const svc = createPreToolUseCompositeService({ dispatchGuard })

  await svc.handle({ projectSlug: 'proj', toolCalls: [{ toolName: 'Read' }, { toolName: 'Agent', requestedAgent: 'solution-architect' }] })
  assert.deepEqual(dispatchGuard.calls, [{ requestedAgent: 'solution-architect', projectSlug: 'proj' }])
})
