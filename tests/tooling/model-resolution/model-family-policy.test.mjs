import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isModelFamily } from '../../../eng/lib/model-family-policy.mjs'

test('any kebab-case word is a model family, the list stays open', () => {
  for (const value of ['haiku', 'sonnet', 'opus', 'gpt-luna', 'gpt-terra', 'astra', 'kimi', 'kimi-k2', 'gemini']) {
    assert.equal(isModelFamily(value), true, value)
  }
})

test('a versioned model name, inherit or a non-string is no model family', () => {
  for (const value of ['inherit', 'Claude Sonnet 5', 'claude-sonnet-5', 'gpt-5', 'claude-haiku-5.5', 'Sonnet', 'sonnet-', '', undefined, ['sonnet']]) {
    assert.equal(isModelFamily(value), false, String(value))
  }
})
