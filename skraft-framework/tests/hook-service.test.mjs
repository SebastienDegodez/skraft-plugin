import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHookService } from '../adapters/drivers/hooks/service-factory.mjs'
import { allow, deny } from '../adapters/drivers/hooks/decision.mjs'

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
