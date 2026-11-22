import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamSummary } from '../../../eng/lib/claude-stream.mjs'
import { REFUSAL, REPL_TOOL, armReading, claudeArgs, permissionVerdict } from '../../../eng/host-probe/claude-repl-permission-probe.mjs'

/** A stream shaped as Claude Code writes one: the denials of a headless session are in its result. */
const stream = ({ called = true, denied = false, reply = `${REFUSAL}: skraft_re` } = {}) => [
  { type: 'system', subtype: 'init', model: 'm', claude_code_version: '2.1.325', tools: ['Read', REPL_TOOL], mcp_servers: [] },
  ...(called ? [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: REPL_TOOL, input: { code: '1+1' } }] } }] : []),
  { type: 'result', result: reply, is_error: false, total_cost_usd: 0.01, permission_denials: denied ? [{ tool_name: REPL_TOOL, tool_use_id: 't', tool_input: { code: '1+1' } }] : [] },
].map((event) => JSON.stringify(event)).join('\n')

const reading = (options) => armReading(streamSummary(stream(options)))

test('an arm shows whether the tool was offered and called, whether the host denied it, and whether the engine answered', () => {
  assert.deepEqual(
    (({ offered, called, denied, reachedEngine }) => ({ offered, called, denied, reachedEngine }))(reading()),
    { offered: true, called: true, denied: false, reachedEngine: true },
  )
  assert.equal(reading({ denied: true, reply: 'NOT CALLED' }).denied, true)
  assert.equal(reading({ denied: true, reply: 'NOT CALLED' }).reachedEngine, false)
})

test('the verdict passes when the host stops the unlisted call and lets the allowed one reach the engine, and fails on any other pair', () => {
  const stopped = reading({ denied: true, reply: 'NOT CALLED' })
  assert.equal(permissionVerdict({ unlisted: stopped, allowed: reading() }), 'pass')
  assert.equal(permissionVerdict({ unlisted: reading(), allowed: reading() }), 'fail', 'an unlisted call that reaches the engine means the host asks nothing')
  assert.equal(permissionVerdict({ unlisted: stopped, allowed: stopped }), 'fail')
  assert.equal(permissionVerdict({ unlisted: stopped, allowed: armReading(streamSummary('')) }), 'inconclusive')
})

test('only the allowed arm names the tool, and Bash is denied in both so that nothing but the tool could have run a program', () => {
  const allowed = claudeArgs({ pluginRoot: '/p', allowed: true, maxBudgetUsd: 1 })
  const unlisted = claudeArgs({ pluginRoot: '/p', allowed: false, maxBudgetUsd: 1 })
  assert.ok(allowed.includes('--allowedTools') && allowed.includes(REPL_TOOL))
  assert.ok(!unlisted.includes('--allowedTools'))
  for (const args of [allowed, unlisted]) assert.deepEqual(args.slice(args.indexOf('--disallowedTools'), args.indexOf('--disallowedTools') + 2), ['--disallowedTools', 'Bash'])
})
