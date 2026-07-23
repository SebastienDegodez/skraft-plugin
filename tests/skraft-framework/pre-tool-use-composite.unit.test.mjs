import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPreToolUseCompositeService } from '../../plugins/src/application/pre-tool-use-composite.mjs'

// The composite fans a single PreToolUse event out to the two guards that govern it —
// G1 dispatch-order (only for orchestrator-tracked agent dispatches) and G7/G8 session
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
