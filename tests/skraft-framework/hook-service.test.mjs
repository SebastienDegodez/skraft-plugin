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
// hook-router.mjs: no handler = allow passthrough (undefined = no override)
test('hook router returns undefined when no PreToolUse handler registered', async () => {
  const service = createHookService({})
  const result = await service.handle({ hookType: 'PreToolUse', toolName: 'bash' })
  assert.equal(result, undefined)
})

test('hook router returns undefined when no SubagentStart handler registered', async () => {
  const service = createHookService({})
  const result = await service.handle({ hookType: 'SubagentStart' })
  assert.equal(result, undefined)
})

test('hook router returns undefined when no SubagentStop handler registered', async () => {
  const service = createHookService({})
  const result = await service.handle({ hookType: 'SubagentStop' })
  assert.equal(result, undefined)
})

test('hook router returns undefined when no PostToolUse handler registered', async () => {
  const service = createHookService({})
  const result = await service.handle({ hookType: 'PostToolUse' })
  assert.equal(result, undefined)
})

// hook-router.mjs: unknown hook type = allow passthrough (undefined)
test('hook router returns undefined for unknown hook type', async () => {
  const service = createHookService({})
  const result = await service.handle({ hookType: 'UnknownHook' })
  assert.equal(result, undefined)
})

// hook-router.mjs: default parameter = {} branch (called with no argument)
test('hook router with no argument returns undefined for any hook type', async () => {
  const { createHookRouter } = await import('../../plugins/src/adapters/api/hooks/hook-router.mjs')
  const router = createHookRouter()
  const result = await router.route('PreToolUse', {})
  assert.equal(result, undefined)
})

// hook-router.mjs: SessionStart routing (update staleness notice entry point)
test('hook router routes SessionStart to the sessionStart handler', async () => {
  const { createHookRouter } = await import('../../plugins/src/adapters/api/hooks/hook-router.mjs')
  const seen = []
  const router = createHookRouter({ sessionStart: { handle: async (p) => { seen.push(p); return { ok: true } } } })
  const result = await router.route('SessionStart', { hookType: 'SessionStart' })
  assert.deepEqual(result, { ok: true })
  assert.equal(seen.length, 1)
})

test('hook router returns undefined when no SessionStart handler registered', async () => {
  const { createHookRouter } = await import('../../plugins/src/adapters/api/hooks/hook-router.mjs')
  const router = createHookRouter({})
  assert.equal(await router.route('SessionStart', {}), undefined)
})

// hook-router.mjs: SUPPORTED_HOOK_TYPES is the single source of truth the
// freshness gate compares hooks.json against.
test('SUPPORTED_HOOK_TYPES lists every routable hook type', async () => {
  const { SUPPORTED_HOOK_TYPES } = await import('../../plugins/src/adapters/api/hooks/hook-router.mjs')
  assert.deepEqual(
    [...SUPPORTED_HOOK_TYPES].sort(),
    ['PostToolUse', 'PreToolUse', 'SessionStart', 'SubagentStart', 'SubagentStop']
  )
})

// hook-entry.mjs: real harness payloads carry hook_event_name (Claude Code and
// the Copilot compat layer), not hookType. Both must route.
test('hook entry routes on hook_event_name (real Claude/Copilot payload shape)', async () => {
  const seen = []
  const service = createHookService({ sessionStart: { handle: async (p) => { seen.push(p); return { ok: 1 } } } })
  const result = await service.handle({ hook_event_name: 'SessionStart' })
  assert.deepEqual(result, { ok: 1 })
  assert.equal(seen.length, 1)
})

// hook-entry.mjs: the CLI passes the event name as argv — used as a fallback
// when the payload carries no recognisable event field at all.
test('hook entry falls back to the injected hook type when the payload has none', async () => {
  const { createHookEntry } = await import('../../plugins/src/adapters/api/hooks/hook-entry.mjs')
  const { createHookRouter } = await import('../../plugins/src/adapters/api/hooks/hook-router.mjs')
  const seen = []
  const router = createHookRouter({ sessionStart: { handle: async (p) => { seen.push(p); return { ok: 2 } } } })
  const entry = createHookEntry(router, { fallbackHookType: 'SessionStart' })
  const result = await entry.handle({})
  assert.deepEqual(result, { ok: 2 })
})

test('hook entry: explicit payload hookType wins over the fallback', async () => {
  const { createHookEntry } = await import('../../plugins/src/adapters/api/hooks/hook-entry.mjs')
  const { createHookRouter } = await import('../../plugins/src/adapters/api/hooks/hook-router.mjs')
  const hits = { pre: 0, session: 0 }
  const router = createHookRouter({
    preToolUse: { handle: async () => { hits.pre++ } },
    sessionStart: { handle: async () => { hits.session++ } }
  })
  const entry = createHookEntry(router, { fallbackHookType: 'SessionStart' })
  await entry.handle({ hookType: 'PreToolUse' })
  assert.equal(hits.pre, 1)
  assert.equal(hits.session, 0)
})

