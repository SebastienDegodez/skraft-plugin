import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamSummary } from '../../../eng/lib/claude-stream.mjs'
import { REACH_TOOL, agentDefinition, armReading, claudeArgs, reachVerdict } from '../../../eng/host-probe/claude-subagent-mcp-probe.mjs'

const VERSION = '2.0.0-alpha.86'
const DISPATCH = 'toolu_dispatch'

/** A stream shaped as Claude Code 2.1.319 writes one: a sub-agent's events carry parent_tool_use_id, the main session's carry none. */
const stream = ({ callers = [DISPATCH], reply = `plugin: ${VERSION}` } = {}) => [
  { type: 'system', subtype: 'init', model: 'm', claude_code_version: '2.1.319', tools: ['Task', REACH_TOOL], mcp_servers: [{ name: 'plugin:skraft:skraft', status: 'connected' }], agents: ['mcp-reach'] },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'mcp-reach' } }] } },
  { type: 'system', subtype: 'task_started', subagent_type: 'mcp-reach', spawn_depth: 1, tool_use_id: DISPATCH },
  ...callers.map((caller) => ({ type: 'assistant', ...(caller === null ? {} : { parent_tool_use_id: caller }), message: { content: [{ type: 'tool_use', name: REACH_TOOL, input: {} }] } })),
  { type: 'result', result: reply, is_error: false, total_cost_usd: 0.02, permission_denials: [] },
].map((event) => JSON.stringify(event)).join('\n')

const readingOf = (options) => armReading(streamSummary(stream(options)), VERSION)

test('a tool the sub-agent called is attributed to its dispatch, and the version it reports is read from the reply', () => {
  const reading = readingOf()
  assert.deepEqual(reading.dispatched, [{ type: 'mcp-reach', depth: 1 }])
  assert.equal(reading.subagentCalledTool, true)
  assert.equal(reading.quotedVersion, true)
})

test('the same call made by the main session is not credited to a sub-agent', () => {
  const reading = readingOf({ callers: [null] })
  assert.equal(reading.anyCallOfTool, true)
  assert.equal(reading.subagentCalledTool, false, 'a call with no parent dispatch came from the main session')
})

test('the tool reaches the agent that declares it, and the arm that declares no skraft tool must reach nothing', () => {
  const declared = readingOf()
  const control = readingOf({ callers: [], reply: 'NO SKRAFT TOOL AVAILABLE' })
  assert.equal(reachVerdict({ declared, control }), 'pass')
  assert.equal(control.saidNoTool, true)
})

test('a control arm that reaches the tool, a declared arm that does not, and an arm without a reply are not a pass', () => {
  const declared = readingOf()
  assert.equal(reachVerdict({ declared, control: readingOf() }), 'fail', 'the control arm must not reach the tool')
  assert.equal(reachVerdict({ declared: readingOf({ callers: [], reply: 'NO SKRAFT TOOL AVAILABLE' }), control: readingOf({ callers: [], reply: 'NO SKRAFT TOOL AVAILABLE' }) }), 'fail')
  assert.equal(reachVerdict({ declared, control: armReading(streamSummary(''), VERSION) }), 'inconclusive', 'a budget or a crash leaves no reply to read')
})

test('each arm grants its own tool and nothing else, and the declared arm is the only one that names the MCP tool', () => {
  const declared = claudeArgs({ pluginRoot: '/p', agents: '/a.json', declared: true, maxBudgetUsd: 1 })
  const control = claudeArgs({ pluginRoot: '/p', agents: '/a.json', declared: false, maxBudgetUsd: 1 })
  assert.ok(declared.includes(REACH_TOOL) && !control.includes(REACH_TOOL))
  assert.deepEqual([declared, control].map((args) => args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2)), [['--tools', 'Task'], ['--tools', 'Task']])
  assert.ok(declared.includes('--permission-prompts') && declared.includes('none'), 'nothing may prompt: the probe is not interactive')
  assert.deepEqual(agentDefinition([REACH_TOOL])['mcp-reach'].tools, [REACH_TOOL])
})
