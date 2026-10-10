import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isHookRelevant, TRACKED_STATE_WRITE_RE } from '../../../plugins/skraft-framework/src/domain/hook-relevance-policy.mjs'

// The manifest no longer filters tools: VS Code ignores matchers, so each tool event has one
// entry and this policy decides, before any guard loads, whether a call can reach a guard.
// A false negative silently disables a guard; these tests pin each tool a guard inspects.

test('hook-relevance: every tool a PreToolUse guard inspects is relevant', () => {
  for (const toolName of ['Agent', 'Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
    assert.equal(isHookRelevant({ event: 'PreToolUse', payload: { toolName } }), true, toolName)
  }
})

test('hook-relevance: a PreToolUse read, search or unknown tool is irrelevant', () => {
  for (const toolName of ['Read', 'Grep', 'Glob', 'read_file', 'semantic_search', undefined]) {
    assert.equal(isHookRelevant({ event: 'PreToolUse', payload: { toolName } }), false, String(toolName))
  }
})

test('hook-relevance: a dispatch is relevant whatever the tool is called', () => {
  assert.equal(isHookRelevant({ event: 'PreToolUse', payload: { toolName: 'runSubagent', requestedAgent: 'Skraft - Software Engineer' } }), true)
  assert.equal(isHookRelevant({ event: 'PreToolUse', payload: { toolName: 'runSubagent', requestedAgent: '' } }), false)
})

test('hook-relevance: a tool call naming a tracked state.json always reaches the guards', () => {
  const raw = JSON.stringify({ tool_name: 'replace_string_in_file', tool_input: { filePath: '.copilot-tracking/skraft-plans/p/state.json' } })
  assert.equal(isHookRelevant({ event: 'PreToolUse', payload: { toolName: 'replace_string_in_file' }, raw }), true)
  assert.equal(isHookRelevant({ event: 'PostToolUse', payload: { toolName: 'replace_string_in_file' }, raw }), true)
  assert.match('skraft-plans\\p\\state.json', TRACKED_STATE_WRITE_RE)
  assert.doesNotMatch('skraft-plans/p/notes.md', TRACKED_STATE_WRITE_RE)
})

test('hook-relevance: PostToolUse keeps skill reads but skips agent returns recorded by RunPipeline', () => {
  assert.equal(isHookRelevant({ event: 'PostToolUse', payload: { toolName: 'Agent' } }), false)
  assert.equal(isHookRelevant({ event: 'PostToolUse', payload: { toolName: 'runSubagent', requestedAgent: 'Skraft - Software Engineer' } }), false)
  assert.equal(isHookRelevant({ event: 'PostToolUse', payload: { toolName: 'Read', filePath: '/p/skills/outside-in-tdd/SKILL.md' } }), true)
  assert.equal(isHookRelevant({ event: 'PostToolUse', payload: { toolName: 'view', toolInput: { path: '/p/skills/x/skill.md' } } }), true)
  assert.equal(isHookRelevant({ event: 'PostToolUse', payload: { toolName: 'Read', toolInput: { file_path: '/p/skills/x/SKILL.md' } } }), true)
  assert.equal(isHookRelevant({ event: 'PostToolUse', payload: { toolName: 'Read', filePath: '/p/src/Foo.cs' } }), false)
  assert.equal(isHookRelevant({ event: 'PostToolUse', payload: { toolName: 'Bash', toolInput: { command: 'ls' } } }), false)
  assert.equal(isHookRelevant({ event: 'PostToolUse', payload: { toolName: 'Read', filePath: '' } }), false)
})

test('hook-relevance: lifecycle and unnamed events always run', () => {
  for (const event of ['SessionStart', 'SubagentStart', 'SubagentStop', undefined]) {
    assert.equal(isHookRelevant({ event, payload: { toolName: 'Read' } }), true, String(event))
  }
  assert.equal(isHookRelevant(), true)
})

test('hook-relevance: a Copilot toolCalls batch is relevant when any of its calls is', () => {
  const batch = (...toolNames) => ({ toolCalls: toolNames.map((toolName) => ({ toolName })) })
  assert.equal(isHookRelevant({ event: 'PreToolUse', payload: batch('Read', 'Write') }), true)
  assert.equal(isHookRelevant({ event: 'PreToolUse', payload: batch('Read', 'grep') }), false)
  assert.equal(isHookRelevant({ event: 'PreToolUse', payload: { toolCalls: [{ toolName: 'runSubagent', requestedAgent: 'software-engineer' }] } }), true)
  assert.equal(isHookRelevant({ event: 'PreToolUse', payload: { toolCalls: [null, 'Write'] } }), false)
  assert.equal(isHookRelevant({ event: 'PostToolUse', payload: { toolCalls: [{ toolName: 'Read', filePath: '/p/skills/x/SKILL.md' }] } }), true)
})
