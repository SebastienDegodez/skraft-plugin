import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromHarnessInput } from '../../plugins/skraft-framework/src/adapters/api/hooks/harness-input.mjs'

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
    ['create_file', 'Write'],
    ['edit', 'Edit'],
    ['str_replace', 'Edit'],
    ['agent', 'Agent'],
    ['task', 'Agent'],
    ['read', 'Read'],
    ['view', 'Read'],
  ]

  for (const [wire, framework] of cases) {
    assert.equal(fromHarnessInput({ toolName: wire }).toolName, framework, `${wire} must become ${framework}`)
  }
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
