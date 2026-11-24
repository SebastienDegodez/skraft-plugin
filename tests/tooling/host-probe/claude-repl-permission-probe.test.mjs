import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamSummary } from '../../../eng/lib/claude-stream.mjs'
import { ARMS, REFUSAL, REPL_TOOL, RESET_TOOL, armReading, claudeArgs, permissionVerdict, promptFor } from '../../../eng/host-probe/claude-repl-permission-probe.mjs'

/** A stream shaped as Claude Code writes one: the denials of a headless session are in its result. */
const stream = ({ tool = REPL_TOOL, called = true, denied = false, reply = `${REFUSAL}: skraft_re` } = {}) => [
  { type: 'system', subtype: 'init', model: 'm', claude_code_version: '2.1.325', tools: ['Read', REPL_TOOL, RESET_TOOL], mcp_servers: [] },
  ...(called ? [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: tool, input: tool === REPL_TOOL ? { code: '1+1' } : {} }] } }] : []),
  { type: 'result', result: reply, is_error: false, total_cost_usd: 0.01, permission_denials: denied ? [{ tool_name: tool, tool_use_id: 't', tool_input: {} }] : [] },
].map((event) => JSON.stringify(event)).join('\n')

const reading = (options = {}) => armReading(streamSummary(stream(options)), options.tool ?? REPL_TOOL)
const stoppedOn = (tool) => reading({ tool, denied: true, reply: 'NOT CALLED' })

test('an arm shows whether its tool was offered and called, whether the host denied it, and whether the engine answered', () => {
  assert.deepEqual(
    (({ offered, called, denied, reachedEngine }) => ({ offered, called, denied, reachedEngine }))(reading()),
    { offered: true, called: true, denied: false, reachedEngine: true },
  )
  assert.equal(stoppedOn(REPL_TOOL).denied, true)
  assert.equal(stoppedOn(REPL_TOOL).reachedEngine, false)
  assert.deepEqual([reading({ tool: RESET_TOOL }).called, stoppedOn(RESET_TOOL).denied], [true, true])
  assert.equal(armReading(streamSummary(stream({ tool: RESET_TOOL, denied: true, reply: 'NOT CALLED' })), REPL_TOOL).denied, false, 'a denial of skraft_repl_reset is no denial of skraft_repl')
})

test('the verdict passes when the host stops each tool it was not given and lets each given one reach the engine, and fails on any other set', () => {
  const pass = { unlisted: stoppedOn(REPL_TOOL), allowed: reading(), resetUnlisted: stoppedOn(RESET_TOOL), resetAllowed: reading({ tool: RESET_TOOL }) }
  assert.equal(permissionVerdict(pass), 'pass')
  assert.equal(permissionVerdict({ ...pass, unlisted: reading() }), 'fail', 'an unlisted call that reaches the engine means the host asks nothing')
  assert.equal(permissionVerdict({ ...pass, allowed: stoppedOn(REPL_TOOL) }), 'fail')
  assert.equal(permissionVerdict({ ...pass, resetUnlisted: reading({ tool: RESET_TOOL }) }), 'fail', 'allowing skraft_repl must not allow skraft_repl_reset')
  assert.equal(permissionVerdict({ ...pass, resetAllowed: stoppedOn(RESET_TOOL) }), 'fail')
  assert.equal(permissionVerdict({ ...pass, resetAllowed: armReading(streamSummary(''), RESET_TOOL) }), 'inconclusive')
})

test('each arm calls one tool and allows exactly the tools it names, skraft_repl_reset never through skraft_repl, and Bash is denied in all', () => {
  assert.deepEqual(ARMS.map(({ name, tool, allowed }) => [name, tool, allowed]), [
    ['unlisted', REPL_TOOL, []],
    ['allowed', REPL_TOOL, [REPL_TOOL]],
    ['resetUnlisted', RESET_TOOL, [REPL_TOOL]],
    ['resetAllowed', RESET_TOOL, [REPL_TOOL, RESET_TOOL]],
  ])
  for (const arm of ARMS) {
    const args = claudeArgs({ pluginRoot: '/p', arm, maxBudgetUsd: 1 })
    assert.equal(args[args.indexOf('-p') + 1], promptFor(arm.tool))
    assert.deepEqual(args.includes('--allowedTools') ? args[args.indexOf('--allowedTools') + 1].split(',') : [], arm.allowed)
    assert.deepEqual(args.slice(args.indexOf('--disallowedTools'), args.indexOf('--disallowedTools') + 2), ['--disallowedTools', 'Bash'])
  }
  assert.match(promptFor(RESET_TOOL), /with no argument/)
  assert.match(promptFor(REPL_TOOL), /code set to the text 1\+1/)
})
