import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromHarnessInput } from '../../../plugins/skraft-framework/src/adapters/api/hooks/harness-input.mjs'

// The two harnesses do not send the same payload. Copilot CLI lowercases the tool name and
// JSON-encodes the arguments; Claude Code sends `tool_name` and a `tool_input` object. The
// services only know the framework vocabulary, so an untranslated Copilot payload reaches G7
// with toolName "bash", the `toolName === 'Bash'` test fails, and a protected write is allowed
// while the guard reports it ran. These tests pin the translation in both directions.

test('harness-input: Copilot lowercased names map onto the framework vocabulary', () => {
  const cases = [
    ['bash', 'Bash'],
    ['shell', 'Bash'],
    ['write', 'Write'],
    ['create', 'Write'],
    ['create_file', 'Write'],
    ['edit', 'Edit'],
    ['str_replace', 'Edit'],
    ['multiedit', 'MultiEdit'],
    ['notebookedit', 'NotebookEdit'],
    ['agent', 'Agent'],
    ['task', 'Agent'],
    ['read', 'Read'],
    ['view', 'Read'],
  ]

  for (const [wire, framework] of cases) {
    assert.equal(fromHarnessInput({ toolName: wire }).toolName, framework, `${wire} must become ${framework}`)
  }
})

test('harness-input: the VS Code read tool maps onto Read', () => {
  const payload = fromHarnessInput({ tool_name: 'read_file', tool_input: { filePath: 'src/Foo.cs' } })
  assert.equal(payload.toolName, 'Read')
  assert.equal(payload.filePath, 'src/Foo.cs')
})

test('harness-input: the mapping is case-insensitive on both harness spellings', () => {
  assert.equal(fromHarnessInput({ toolName: 'BASH' }).toolName, 'Bash')
  assert.equal(fromHarnessInput({ tool_name: 'Create_File' }).toolName, 'Write')
  assert.equal(fromHarnessInput({ tool_name: 'Bash' }).toolName, 'Bash')
})

test('harness-input: an unknown tool name passes through untouched', () => {
  // A guard that does not recognise a tool must not rename it — renaming would make an
  // unrelated tool look like one the guards inspect.
  assert.equal(fromHarnessInput({ toolName: 'WebFetch' }).toolName, 'WebFetch')
  assert.equal(fromHarnessInput({ toolName: 'mcp__thing' }).toolName, 'mcp__thing')
})

test('harness-input: a non-string tool name is left alone rather than coerced', () => {
  // Nothing is invented: the translation only rewrites what it recognises, so a payload
  // carrying a non-string name reaches the guards exactly as the harness sent it.
  assert.equal(fromHarnessInput({ toolName: 42 }).toolName, 42)
  assert.equal(fromHarnessInput({ toolName: null }).toolName, null)
  assert.equal('toolName' in fromHarnessInput({}), false)
})

test('harness-input: a Copilot JSON-encoded argument string becomes an object', () => {
  const payload = fromHarnessInput({ toolName: 'bash', toolArgs: '{"command":"rm -rf /"}' })

  assert.deepEqual(payload.toolInput, { command: 'rm -rf /' })
})

test('harness-input: a Claude Code argument object is taken as-is', () => {
  const toolInput = { file_path: 'state.json', content: '{}' }

  assert.equal(fromHarnessInput({ tool_name: 'Write', tool_input: toolInput }).toolInput, toolInput)
})

test('harness-input: every argument spelling the harnesses use is read', () => {
  assert.deepEqual(fromHarnessInput({ toolInput: { a: 1 } }).toolInput, { a: 1 })
  assert.deepEqual(fromHarnessInput({ tool_input: { b: 2 } }).toolInput, { b: 2 })
  assert.deepEqual(fromHarnessInput({ toolArgs: '{"c":3}' }).toolInput, { c: 3 })
  assert.deepEqual(fromHarnessInput({ tool_args: '{"d":4}' }).toolInput, { d: 4 })
})

test('harness-input: the framework spelling wins over the harness one', () => {
  const payload = fromHarnessInput({ toolInput: { framework: true }, toolArgs: '{"harness":true}' })

  assert.deepEqual(payload.toolInput, { framework: true })
})

test('harness-input: malformed or non-object arguments never throw', () => {
  // A hook bug must never freeze the pipeline: an unparseable payload drops the field
  // and lets the guard decide on what it can actually see.
  for (const toolArgs of ['not json', '"a string"', 'null', '42', 7, null, undefined]) {
    const payload = fromHarnessInput({ toolName: 'bash', toolArgs })
    assert.equal('toolInput' in payload, false, `${String(toolArgs)} must not produce a toolInput`)
  }

  // An encoded array is still an object on the wire, and passing it through is what lets
  // a guard reject it on its own terms instead of never seeing it.
  assert.deepEqual(fromHarnessInput({ toolArgs: '[1,2]' }).toolInput, [1, 2])
})

test('harness-input: unrelated fields survive the translation', () => {
  const payload = fromHarnessInput({
    toolName: 'write',
    toolArgs: '{"file_path":"state.json"}',
    cwd: '/repo',
    sessionId: 'session-1',
  })

  assert.equal(payload.cwd, '/repo')
  assert.equal(payload.sessionId, 'session-1')
  assert.equal(payload.toolName, 'Write')
  assert.deepEqual(payload.toolInput, { file_path: 'state.json' })
})

test('harness-input: an absent payload is still a payload', () => {
  assert.deepEqual(fromHarnessInput(undefined, { env: {} }), {})
  assert.deepEqual(fromHarnessInput({}, { env: {} }), {})
})

test('harness-input: Claude agent_type becomes the framework agentName', () => {
  const payload = fromHarnessInput({ agent_type: 'skraft:skraft-orchestrator' }, { env: {} })

  assert.equal(payload.agentName, 'skraft:skraft-orchestrator')
  assert.equal(payload.harness, 'claude-code')
})

test('harness-input: each wire field names its harness', () => {
  assert.equal(fromHarnessInput({ agentType: 'software-engineer' }, { env: {} }).harness, 'claude-code')
  assert.equal(fromHarnessInput({ tool_args: '{}' }, { env: {} }).harness, 'copilot')
  assert.equal(fromHarnessInput({ agentName: 'software-engineer' }, { env: {} }).harness, 'copilot')
})

test('harness-input: without a wire field, the one plugin root variable set names the harness', () => {
  const harnessIn = (env) => fromHarnessInput({ tool_name: 'Bash' }, { env }).harness
  assert.equal(harnessIn({ PLUGIN_ROOT: '/plugin' }), 'copilot')
  assert.equal(harnessIn({ CLAUDE_PLUGIN_ROOT: '/plugin' }), 'claude-code')
  assert.equal(harnessIn({ PLUGIN_ROOT: '/plugin', CLAUDE_PLUGIN_ROOT: '/plugin' }), undefined, 'both set: undecided')
  assert.equal(harnessIn({}), undefined)
})

test('harness-input: PLUGIN_ROOT identifies a Copilot hook process', () => {
  const payload = fromHarnessInput(
    { agentName: 'skraft-orchestrator' },
    { env: { PLUGIN_ROOT: '/plugin' } },
  )

  assert.equal(payload.agentName, 'skraft-orchestrator')
  assert.equal(payload.harness, 'copilot')
})

test('harness-input: installed Copilot wire shape wins over its shared Claude root variable', () => {
  const payload = fromHarnessInput(
    { toolName: 'read', toolArgs: '{"filePath":"README.md"}' },
    { env: { CLAUDE_PLUGIN_ROOT: '/installed/plugin' } },
  )

  assert.equal(payload.harness, 'copilot')
})

test('harness-input: an explicit harness overrides environment detection', () => {
  const payload = fromHarnessInput(
    { agent_name: 'agent', harness: 'claude-code' },
    { env: { PLUGIN_ROOT: '/plugin' } },
  )

  assert.equal(payload.agentName, 'agent')
  assert.equal(payload.harness, 'claude-code')
})

test('harness-input: native argument aliases expose guard signals without changing tool arguments', () => {
  const toolInput = { subagent_type: 'skraft:software-engineer', file_path: 'state.json' }
  const payload = fromHarnessInput({ tool_name: 'Task', tool_input: toolInput }, { env: {} })
  assert.equal(payload.toolName, 'Agent')
  assert.equal(payload.toolInput, toolInput)
  assert.equal(payload.requestedAgent, 'skraft:software-engineer')
  assert.equal(payload.filePath, 'state.json')
  assert.equal(payload.projectSlug, undefined)
})

test('harness-input: explicit guard signals and camelCase arguments win over native aliases', () => {
  const toolInput = {
    subagentType: 'canonical-agent', subagent_type: 'native-agent',
    filePath: 'canonical-path', file_path: 'native-path', path: 'legacy-path'
  }
  const argumentsOnly = fromHarnessInput({ toolInput }, { env: {} })
  assert.equal(argumentsOnly.requestedAgent, 'canonical-agent')
  assert.equal(argumentsOnly.filePath, 'canonical-path')
  const explicit = fromHarnessInput({ requestedAgent: 'explicit-agent', filePath: 'explicit-path', toolInput }, { env: {} })
  assert.equal(explicit.requestedAgent, 'explicit-agent')
  assert.equal(explicit.filePath, 'explicit-path')
})

// Copilot CLI batches the tool calls of a turn: `{ sessionId, cwd, toolCalls: [{ id, name, args }] }`,
// with no root toolName / toolArgs / agentName (payload recorded from a Copilot session log).
test('harness-input: a Copilot toolCalls batch becomes framework tool calls', () => {
  const payload = fromHarnessInput({
    sessionId: 'toolu_child',
    cwd: '/repo',
    toolCalls: [
      { id: 'toolu_1', name: 'create', args: '{"path":"/repo/src/Orders/Order.cs","file_text":"class Order {}"}' },
      { id: 'toolu_2', name: 'edit', args: { path: 'tests/OrderTests.cs', old_str: 'a', new_str: 'b' } },
      { id: 'toolu_3', name: 'bash', args: '{"command":"dotnet test"}' },
      { id: 'toolu_4', name: 'task', args: '{"subagent_type":"software-engineer"}' },
    ],
  }, { env: {} })

  assert.equal(payload.harness, 'copilot')
  assert.equal(payload.toolName, undefined, 'a batch has no root tool')
  assert.deepEqual(payload.toolCalls, [
    { toolCallId: 'toolu_1', toolName: 'Write', toolInput: { path: '/repo/src/Orders/Order.cs', file_text: 'class Order {}' }, filePath: '/repo/src/Orders/Order.cs' },
    { toolCallId: 'toolu_2', toolName: 'Edit', toolInput: { path: 'tests/OrderTests.cs', old_str: 'a', new_str: 'b' }, filePath: 'tests/OrderTests.cs' },
    { toolCallId: 'toolu_3', toolName: 'Bash', toolInput: { command: 'dotnet test' } },
    { toolCallId: 'toolu_4', toolName: 'Agent', toolInput: { subagent_type: 'software-engineer' }, requestedAgent: 'software-engineer' },
  ])
})

test('harness-input: malformed toolCalls entries are dropped, never thrown on', () => {
  const payload = fromHarnessInput({ toolCalls: [null, 'bash', { name: 'bash', args: '{ not json' }] }, { env: {} })
  assert.deepEqual(payload.toolCalls, [{ toolName: 'Bash' }])
  assert.equal('toolCalls' in fromHarnessInput({ toolName: 'bash' }, { env: {} }), false)
})

test('harness-input: name and args are read on a batch entry only, never on the payload root', () => {
  const payload = fromHarnessInput({ name: 'bash', args: '{"command":"rm -rf src/"}' }, { env: {} })
  assert.equal(payload.toolName, undefined)
  assert.equal(payload.toolInput, undefined)
})
