import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalise } from '../adapters/api/hooks/payload.mjs'

test('AC4: camelCase payload passes through unchanged', () => {
  assert.deepEqual(normalise({ toolName: 'bash' }), { toolName: 'bash' })
})

test('AC4: PascalCase payload normalised to camelCase', () => {
  const result = normalise({ ToolName: 'bash' })
  assert.equal(result.toolName, 'bash')
  assert.ok(!('ToolName' in result))
})

test('AC4: snake_case payload normalised to camelCase', () => {
  const result = normalise({ tool_name: 'bash' })
  assert.equal(result.toolName, 'bash')
  assert.ok(!('tool_name' in result))
})

test('AC4: mixed-format payload fully normalised', () => {
  const result = normalise({ toolName: 'bash', ToolInput: 'arg', tool_use_id: '123' })
  assert.equal(result.toolName, 'bash')
  assert.equal(result.toolInput, 'arg')
  assert.equal(result.toolUseId, '123')
})

test('AC4: nested objects are recursively normalised', () => {
  const result = normalise({ tool_input: { File_Path: '/repo' } })
  assert.deepEqual(result.toolInput, { filePath: '/repo' })
})

test('array values within objects are preserved and recursively normalised', () => {
  const result = normalise({ tool_inputs: ['a', 'b'] })
  assert.deepEqual(result.toolInputs, ['a', 'b'])
})

test('null input returns null', () => {
  assert.equal(normalise(null), null)
})
