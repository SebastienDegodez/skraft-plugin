import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROTOCOL_VERSIONS } from '../../../../plugins/skraft-framework/engine/drivers/cli/mcp-server.mjs'
import { mcpHost } from './mcp-host.mjs'

const TOOL_NAMES = [
  'skraft_answer', 'skraft_doctor', 'skraft_init', 'skraft_start', 'skraft_next', 'skraft_record', 'skraft_status', 'skraft_report',
  'skraft_journal', 'skraft_gate', 'skraft_precheck', 'skraft_review', 'skraft_workflow_check', 'skraft_workflow_diff', 'skraft_workflow_eject', 'skraft_migrate',
]

/** The tools and prompts that conduct the agent loop, which only VS Code has to. */
const LOOP_TOOLS = ['skraft_start', 'skraft_next', 'skraft_record', 'skraft_review']
const LOOP_PROMPTS = ['run', 'review']

test('the handshake answers the protocol version the host asks for when the server speaks it, else the latest, with the tools and prompts capabilities, the plugin version and the instructions that set a repository up first', async () => {
  for (const [asked, answered] of [['2025-06-18', '2025-06-18'], ['2024-11-05', '2024-11-05'], ['2099-01-01', PROTOCOL_VERSIONS[0]]]) {
    const host = mcpHost()

    const { id, result: { instructions, ...result } } = await host.initialize(asked)

    assert.deepEqual({ id, result }, {
      id: 1,
      result: {
        protocolVersion: answered,
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: 'skraft', title: 'skraft', version: 'in-process' },
      },
    })
    assert.match(instructions, /Before the first prompt in a repository, call skraft_doctor\. When its config check fails, or a run is refused with configuration-incomplete, set skraft up with the skraft-init skill, which calls skraft_init\./)
    assert.equal(await host.close(), 0)
  }
  assert.equal(PROTOCOL_VERSIONS[0], '2025-11-25')
})

test('VS Code, which has no pipeline of its own, gets the agent loop, kept for the Skraft orchestrator agent', async () => {
  for (const client of ['Visual Studio Code', 'Visual Studio Code - Insiders']) {
    const host = mcpHost({ client })

    const { result: { instructions } } = await host.initialize()
    const { result: { tools } } = await host.request('tools/list')
    const { result: { prompts } } = await host.request('prompts/list')

    assert.deepEqual(tools.map(({ name }) => name), TOOL_NAMES)
    assert.deepEqual(prompts.map(({ name }) => name), ['init', 'run', 'status', 'review'])
    assert.match(instructions, /Only the Skraft - Orchestrator agent conducts a pipeline: hand it the story\. It alone calls skraft_start, then skraft_next and skraft_record as each answer's then names\./)
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
    for (const name of ['skraft_start', 'skraft_next', 'skraft_record']) assert.match(byName[name].description, /^For the Skraft - Orchestrator agent only\. /)
  assert.equal(byName.skraft_precheck.title, 'Pre-check what the open attempt has written')
  assert.match(byName.skraft_precheck.description, /^Runs, inside your own attempt, the mechanical checks the engine runs when you submit — /)
  assert.match(byName.skraft_precheck.description, /It starts no agent, changes nothing you wrote, and approves nothing/)
    await host.close()
  }
})

test('a host that runs the pipeline itself, an unknown one or one that gives no name is offered neither the agent loop tools nor their prompts, and calling one is refused before anything runs', async () => {
  for (const client of ['GitHub Copilot CLI', 'claude-code', 'Visual Studio Code Extension', 'Cursor', null]) {
    const host = mcpHost({ client, workingDirectory: '/no/such/folder' })

    const { result: { instructions } } = await host.initialize()
    const { result: { tools } } = await host.request('tools/list')
    const { result: { prompts } } = await host.request('prompts/list')
    const calls = await Promise.all(LOOP_TOOLS.map((name) => host.request('tools/call', { name, arguments: name === 'skraft_review' ? { pr: 1 } : { slug: 'refund' } })))
    const prompted = await Promise.all(LOOP_PROMPTS.map((name) => host.request('prompts/get', { name, arguments: name === 'run' ? { slug: 'refund' } : { pr: '1' } })))

    assert.deepEqual(tools.map(({ name }) => name), TOOL_NAMES.filter((name) => !LOOP_TOOLS.includes(name)), String(client))
    assert.deepEqual(prompts.map(({ name }) => name), ['init', 'status'])
    assert.doesNotMatch(instructions, /calls skraft_start|then skraft_next and skraft_record/)
    assert.match(instructions, /A story or a review runs through the host's own skraft pipeline \(the skraft-pipeline and skraft-review workflows on GitHub Copilot CLI, \/skraft on Claude Code\), which the Skraft orchestrator agent starts; this server starts none\./)
    assert.deepEqual(calls.map(({ error }) => error), LOOP_TOOLS.map(() => ({ code: -32602, message: 'Unknown tool' })))
    assert.deepEqual(prompted.map(({ error }) => error), LOOP_PROMPTS.map(() => ({ code: -32602, message: 'Unknown prompt' })))
    assert.equal(host.received.some(({ method }) => method === 'roots/list'), false)
    await host.close()
  }
})

test('a ping is answered, a notification is not, an unknown method, a line that is no JSON and a message that is no JSON-RPC object are refused with their JSON-RPC codes', async () => {
  const host = mcpHost()
  await host.initialize()

  host.notify('notifications/cancelled', { requestId: 1 })
  host.write('{ not json')
  host.write('[{"jsonrpc":"2.0","id":7,"method":"ping"}]')
  host.write('{"id":8,"method":"ping"}')
  host.write('   ')
  const pinged = await host.request('ping')
  const unknown = await host.request('resources/list')

  assert.deepEqual(pinged, { jsonrpc: '2.0', id: 2, result: {} })
  assert.deepEqual(unknown, { jsonrpc: '2.0', id: 3, error: { code: -32601, message: 'Method not found' } })
  assert.deepEqual(host.received.slice(1, 4), [
    { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
    { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } },
    { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } },
  ])
  assert.equal(host.received.length, 6)
  assert.equal(await host.close(), 0)
  assert.deepEqual(host.log, [])
})

test('tools/list offers every command an agent may run, each with a closed input schema that takes a workspace, and none that takes a person\'s yes', async () => {
  const host = mcpHost()
  await host.initialize()

  const { result: { tools } } = await host.request('tools/list')

  assert.deepEqual(tools.map(({ name }) => name), TOOL_NAMES)
  for (const { inputSchema } of tools) {
    assert.equal(inputSchema.type, 'object')
    assert.equal(inputSchema.additionalProperties, false)
    assert.deepEqual(inputSchema.properties.workspace.type, 'string')
  }
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  assert.deepEqual(byName.skraft_start.inputSchema, {
    type: 'object', additionalProperties: false, required: ['slug'],
    properties: {
      slug: { type: 'string', minLength: 1, description: 'the kebab-case scope of the story' },
      issue: { type: 'integer', minimum: 1, description: 'the issue of the story; never invent one' },
      title: { type: 'string', minLength: 1, description: 'the title of the story' },
      base: { type: 'string', minLength: 1, description: 'the ref the story starts from' },
      fromArtifacts: { type: 'boolean', description: 'start from the artifacts already in the working copy' },
      workspace: { type: 'string', minLength: 1, description: 'the working copy to work in: the absolute path of its root folder when the host shares no root folder; else a root folder of the host, by its path or its folder name, only needed when the host shares several' },
    },
  })
  assert.deepEqual(byName.skraft_init.inputSchema.properties.add, { type: 'array', items: { type: 'string', minLength: 1 }, description: 'folders to detect beyond the ones found' })
  assert.deepEqual(byName.skraft_review.inputSchema.required, ['pr'])
  assert.deepEqual(Object.keys(byName.skraft_review.inputSchema.properties), ['pr', 'record', 'workspace'])
  assert.deepEqual(tools.filter(({ annotations }) => annotations.readOnlyHint).map(({ name }) => name),
    ['skraft_status', 'skraft_report', 'skraft_journal', 'skraft_workflow_check', 'skraft_workflow_diff', 'skraft_migrate'])
  assert.deepEqual(byName.skraft_doctor.annotations, { title: 'Check skraft is ready', readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true })
  await host.close()
})

test('the prompts set skraft up, run a story, show where it stands and review a pull request; each names the tools to call, and a missing or malformed argument is refused', async () => {
  const host = mcpHost()
  await host.initialize()

  const { result: { prompts } } = await host.request('prompts/list')
  const run = await host.request('prompts/get', { name: 'run', arguments: { slug: 'pay-by-card', issue: '42' } })
  const review = await host.request('prompts/get', { name: 'review', arguments: { pr: '7' } })
  const setUp = await host.request('prompts/get', { name: 'init' })

  assert.deepEqual(prompts.map(({ name, arguments: listed }) => [name, listed.map(({ name: argument, required }) => `${argument}${required ? '' : '?'}`)]),
    [['init', []], ['run', ['slug', 'issue?']], ['status', []], ['review', ['pr']]])
  const [runText] = run.result.messages.map(({ role, content }) => `${role}: ${content.text}`)
  assert.match(runText, /^user: Call skraft_start with \{"slug":"pay-by-card","issue":42\}, then skraft_next\.\n/)
  assert.match(runText, /write its final message unchanged to its reply file; then do what then says\./)
  assert.match(review.result.messages[0].content.text, /^Call skraft_review with \{"pr":7\}\./)
  assert.match(setUp.result.messages[0].content.text, /^Call skraft_doctor\. Then follow the skraft-init skill/)
  assert.deepEqual((await host.request('prompts/get', { name: 'run', arguments: { slug: 'pay-by-card' } })).result.messages[0].content.text.split('\n')[0], 'Call skraft_start with {"slug":"pay-by-card"}, then skraft_next.')
  for (const [params, message] of [
    [{ name: 'deploy' }, 'Unknown prompt'],
    [{ name: 'run', arguments: {} }, 'the prompt run needs the argument slug'],
    [{ name: 'run', arguments: { slug: 'Pay By Card' } }, 'the argument slug of the prompt run is malformed'],
    [{ name: 'review', arguments: { pr: '0' } }, 'the argument pr of the prompt review is malformed'],
    [{ name: 'status', arguments: { verbose: 'yes' } }, 'the prompt status takes only these arguments: none'],
  ]) assert.deepEqual((await host.request('prompts/get', params)).error, { code: -32602, message })
  await host.close()
})
