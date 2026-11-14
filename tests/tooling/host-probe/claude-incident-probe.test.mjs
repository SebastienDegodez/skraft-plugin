import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamSummary } from '../../../eng/lib/claude-stream.mjs'
import { incidentVerdict } from '../../../eng/host-probe/claude-incident-probe.mjs'

const TOKEN = 'skraft-probe-incident-abc'
const OPTIONS = ['RETRY', 'ABORT']
const stream = (reply) => [
  { type: 'system', subtype: 'init', model: 'm', claude_code_version: '9.9.9', tools: ['Read', 'mcp__plugin_skraft_skraft__skraft_status', 'mcp__plugin_skraft_skraft__skraft_answer'], mcp_servers: [{ name: 'plugin:skraft:skraft', status: 'connected' }] },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__plugin_skraft_skraft__skraft_status', input: {} }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'reading' }, { type: 'tool_use', name: 'Read', input: { file_path: '/log' } }] } },
  { type: 'result', result: reply, is_error: false, total_cost_usd: 0.05, permission_denials: [] },
].map((event) => JSON.stringify(event)).join('\n')

test('a session that reads the incident question and its output, then records one option, passes; the stream gives its calls and cost', () => {
  const summary = streamSummary(`${stream(`${TOKEN} ABORT`)}\nnot json`)
  assert.deepEqual(summary.calls.map(({ name }) => name), ['mcp__plugin_skraft_skraft__skraft_status', 'Read'])
  assert.equal(summary.costUsd, 0.05)
  assert.equal(summary.claudeCode, '9.9.9')
  assert.equal(incidentVerdict({ summary, answered: [{ key: 'research-1', answer: 'ABORT', by: 'decide' }], token: TOKEN, options: OPTIONS }), 'pass')
})

test('a session that does not quote the output, records nothing, or ends without a result does not pass', () => {
  const answered = [{ key: 'research-1', answer: 'ABORT', by: 'decide' }]
  assert.equal(incidentVerdict({ summary: streamSummary(stream('unknown ABORT')), answered, token: TOKEN, options: OPTIONS }), 'fail')
  assert.equal(incidentVerdict({ summary: streamSummary(stream(`${TOKEN} ABORT`)), answered: [], token: TOKEN, options: OPTIONS }), 'fail')
  assert.equal(incidentVerdict({ summary: streamSummary(''), answered, token: TOKEN, options: OPTIONS }), 'inconclusive')
})
