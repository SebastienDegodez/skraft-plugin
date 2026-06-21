import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHookService } from '../../plugins/src/adapters/api/hooks/service-factory.mjs'
import { allow, deny, block, additionalContext } from '../../plugins/src/adapters/api/hooks/decision.mjs'

test('hook service routes PreToolUse to registered handler', async () => {
  const preToolUse = { handle: async (_p) => allow() }
  const service = createHookService({ preToolUse })
  const result = await service.handle({ hookType: 'PreToolUse', toolName: 'bash' })
  assert.equal(result.decision, 'allow')
})

test('hook service normalises snake_case payload before routing', async () => {
  let received = null
  const preToolUse = { handle: async (p) => { received = p; return allow() } }
  const service = createHookService({ preToolUse })
  await service.handle({ hook_type: 'PreToolUse', tool_name: 'bash' })
  assert.equal(received.toolName, 'bash')
})

test('hook service routes SubagentStop to registered handler', async () => {
  const subagentStop = { handle: async (_p) => allow() }
  const service = createHookService({ subagentStop })
  const result = await service.handle({ hookType: 'SubagentStop' })
  assert.equal(result.decision, 'allow')
})

test('hook service deny decision propagates', async () => {
  const preToolUse = { handle: async (_p) => deny('dangerous tool') }
  const service = createHookService({ preToolUse })
  const result = await service.handle({ hookType: 'PreToolUse' })
  assert.equal(result.decision, 'deny')
  assert.equal(result.message, 'dangerous tool')
})

// decision.mjs branch coverage: allow(message), block, additionalContext
test('allow with message includes message in response', async () => {
  const preToolUse = { handle: async (_p) => allow('permitted') }
  const result = await createHookService({ preToolUse }).handle({ hookType: 'PreToolUse' })
  assert.equal(result.decision, 'allow')
  assert.equal(result.message, 'permitted')
})

test('block decision propagates with message', async () => {
  const preToolUse = { handle: async (_p) => block('policy violation') }
  const result = await createHookService({ preToolUse }).handle({ hookType: 'PreToolUse' })
  assert.equal(result.decision, 'block')
  assert.equal(result.message, 'policy violation')
})

test('additionalContext decision propagates', async () => {
  const preToolUse = { handle: async (_p) => additionalContext('extra info') }
  const result = await createHookService({ preToolUse }).handle({ hookType: 'PreToolUse' })
  assert.equal(result.decision, 'additionalContext')
  assert.equal(result.context, 'extra info')
})

// hook-entry.mjs branch: payload.type fallback when hookType absent
test('hook entry falls back to payload.type when hookType absent', async () => {
  const preToolUse = { handle: async (_p) => allow() }
  const service = createHookService({ preToolUse })
  const result = await service.handle({ type: 'PreToolUse', toolName: 'bash' })
  assert.equal(result.decision, 'allow')
})

// decision.mjs: default message fallbacks
test('deny without argument uses default message', async () => {
  const preToolUse = { handle: async (_p) => ({ decision: 'deny', message: undefined ?? 'Denied' }) }
  // Test deny() default via direct import
  const { deny: d } = await import('../../plugins/src/adapters/api/hooks/decision.mjs')
  const result = d()
  assert.equal(result.decision, 'deny')
  assert.equal(result.message, 'Denied')
})

test('block without argument uses default message', async () => {
  const { block: b } = await import('../../plugins/src/adapters/api/hooks/decision.mjs')
  const result = b()
  assert.equal(result.decision, 'block')
  assert.equal(result.message, 'Blocked')
})
test('hook router throws when SubagentStop handler not registered', async () => {
  const service = createHookService({})
  await assert.rejects(() => service.handle({ hookType: 'SubagentStop' }), /No SubagentStop handler/)
})

// hook-router.mjs: unknown hook type throws
test('hook router throws for unknown hook type', async () => {
  const service = createHookService({})
  await assert.rejects(() => service.handle({ hookType: 'UnknownHook' }), /Unknown hook type/)
})

// hook-router.mjs: default parameter = {} branch (called with no argument)
test('hook router works with no argument — default empty handlers', async () => {
  const { createHookRouter } = await import('../../plugins/src/adapters/api/hooks/hook-router.mjs')
  const router = createHookRouter()  // exercises = {} default
  await assert.rejects(() => router.route('PreToolUse', {}), /No PreToolUse handler/)
})

