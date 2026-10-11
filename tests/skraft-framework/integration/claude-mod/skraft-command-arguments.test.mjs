import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSkraftCommand, toolRequest } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/command-args.mjs'

test('/skraft alone, or blank, asks for the status', () => {
  assert.deepEqual(parseSkraftCommand(''), { command: 'status' })
  assert.deepEqual(parseSkraftCommand('  \t '), { command: 'status' })
  assert.deepEqual(parseSkraftCommand(undefined), { command: 'status' })
  assert.deepEqual(parseSkraftCommand('status'), { command: 'status' })
  assert.deepEqual(parseSkraftCommand(' help '), { command: 'status' })
  assert.equal(parseSkraftCommand('status #4').command, 'run')
})

test('/skraft <slug> [#issue] [title…] asks for a run with its story', () => {
  assert.deepEqual(parseSkraftCommand('checkout'), { command: 'run', slug: 'checkout', story: null })
  assert.deepEqual(parseSkraftCommand(' checkout  #42   Pay by  card '), { command: 'run', slug: 'checkout', story: { issue: 42, title: 'Pay by card' } })
  assert.deepEqual(parseSkraftCommand('checkout #42'), { command: 'run', slug: 'checkout', story: { issue: 42, title: null } })
  assert.deepEqual(parseSkraftCommand('checkout Pay by card'), { command: 'run', slug: 'checkout', story: { issue: null, title: 'Pay by card' } })
  assert.deepEqual(parseSkraftCommand('checkout 2 factor login'), { command: 'run', slug: 'checkout', story: { issue: null, title: '2 factor login' } })
  assert.deepEqual(parseSkraftCommand('checkout #4a2'), { command: 'run', slug: 'checkout', story: { issue: null, title: '#4a2' } })
  assert.deepEqual(parseSkraftCommand('checkout x #42'), { command: 'run', slug: 'checkout', story: { issue: null, title: 'x #42' } })
})

test('the slug is passed as typed: Init, not the parser, judges it', () => {
  assert.deepEqual(parseSkraftCommand('Not_A_Slug'), { command: 'run', slug: 'Not_A_Slug', story: null })
})

test('/skraft decide … is the decide command, never a slug', () => {
  assert.deepEqual(parseSkraftCommand('decide'), { command: 'decide', words: [] })
  assert.deepEqual(parseSkraftCommand('decide checkout key yes'), { command: 'decide', words: ['checkout', 'key', 'yes'] })
})

test('the tool input becomes a run; no slug resumes the active pipeline', () => {
  assert.deepEqual(toolRequest({}), { command: 'run', slug: null, story: null })
  assert.deepEqual(toolRequest(undefined), { command: 'run', slug: null, story: null })
  assert.deepEqual(toolRequest({ slug: '  ' }), { command: 'run', slug: null, story: null })
  assert.deepEqual(toolRequest({ slug: ' checkout ', issue: 42, title: ' Pay ' }), { command: 'run', slug: 'checkout', story: { issue: 42, title: 'Pay' } })
  assert.deepEqual(toolRequest({ slug: 'checkout', issue: 0, title: '' }), { command: 'run', slug: 'checkout', story: null })
  assert.deepEqual(toolRequest({ slug: 'checkout', issue: 4.5 }), { command: 'run', slug: 'checkout', story: null })
  assert.deepEqual(toolRequest({ slug: 'checkout', issue: '42', title: 7 }), { command: 'run', slug: 'checkout', story: null })
  assert.deepEqual(toolRequest({ slug: 'checkout', title: 'Pay' }), { command: 'run', slug: 'checkout', story: { issue: null, title: 'Pay' } })
  assert.deepEqual(toolRequest({ slug: 3 }), { command: 'run', slug: null, story: null })
})
