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
  assert.deepEqual(parseSkraftCommand('checkout'), { command: 'run', slug: 'checkout', story: null, base: null, fromArtifacts: false })
  assert.deepEqual(parseSkraftCommand(' checkout  #42   Pay by  card '), { command: 'run', slug: 'checkout', story: { issue: 42, title: 'Pay by card' }, base: null, fromArtifacts: false })
  assert.deepEqual(parseSkraftCommand('checkout #42'), { command: 'run', slug: 'checkout', story: { issue: 42, title: null }, base: null, fromArtifacts: false })
  assert.deepEqual(parseSkraftCommand('checkout Pay by card'), { command: 'run', slug: 'checkout', story: { issue: null, title: 'Pay by card' }, base: null, fromArtifacts: false })
  assert.deepEqual(parseSkraftCommand('checkout 2 factor login'), { command: 'run', slug: 'checkout', story: { issue: null, title: '2 factor login' }, base: null, fromArtifacts: false })
  assert.deepEqual(parseSkraftCommand('checkout #4a2'), { command: 'run', slug: 'checkout', story: { issue: null, title: '#4a2' }, base: null, fromArtifacts: false })
  assert.deepEqual(parseSkraftCommand('checkout x #42'), { command: 'run', slug: 'checkout', story: { issue: null, title: 'x #42' }, base: null, fromArtifacts: false })
  assert.deepEqual(parseSkraftCommand('checkout PR#42 follow-up'), { command: 'run', slug: 'checkout', story: { issue: null, title: 'PR#42 follow-up' }, base: null, fromArtifacts: false })
})

test('--base <ref> anywhere after the slug is the run\'s base, not part of the title', () => {
  assert.deepEqual(parseSkraftCommand('checkout #42 Pay by card --base develop'), { command: 'run', slug: 'checkout', story: { issue: 42, title: 'Pay by card' }, base: 'develop', fromArtifacts: false })
  assert.deepEqual(parseSkraftCommand('checkout --base release/2.0 #42 Pay'), { command: 'run', slug: 'checkout', story: { issue: 42, title: 'Pay' }, base: 'release/2.0', fromArtifacts: false })
  assert.deepEqual(parseSkraftCommand('checkout --base'), { command: 'run', slug: 'checkout', story: null, base: '', fromArtifacts: false })
  assert.deepEqual(toolRequest({ slug: 'checkout', base: ' develop ', fromArtifacts: false }), { command: 'run', slug: 'checkout', story: null, base: 'develop', fromArtifacts: false })
  assert.deepEqual(toolRequest({ slug: 'checkout', base: 7 }), { command: 'run', slug: 'checkout', story: null, base: null, fromArtifacts: false })
  assert.deepEqual(toolRequest({ slug: 'checkout', base: '   ' }), { command: 'run', slug: 'checkout', story: null, base: null, fromArtifacts: false })
})

test('--from-artifacts anywhere after the slug starts the run from its DISCUSS stories', () => {
  assert.deepEqual(parseSkraftCommand('checkout --from-artifacts'), { command: 'run', slug: 'checkout', story: null, base: null, fromArtifacts: true })
  assert.deepEqual(parseSkraftCommand('checkout #42 --from-artifacts Pay --base develop'), { command: 'run', slug: 'checkout', story: { issue: 42, title: 'Pay' }, base: 'develop', fromArtifacts: true })
  assert.deepEqual(parseSkraftCommand('checkout --base --from-artifacts'), { command: 'run', slug: 'checkout', story: null, base: '', fromArtifacts: true })
  assert.deepEqual(parseSkraftCommand('checkout from-artifacts'), { command: 'run', slug: 'checkout', story: { issue: null, title: 'from-artifacts' }, base: null, fromArtifacts: false })
  assert.deepEqual(toolRequest({ slug: 'checkout', fromArtifacts: true }), { command: 'run', slug: 'checkout', story: null, base: null, fromArtifacts: true })
  assert.deepEqual(toolRequest({ slug: 'checkout', fromArtifacts: 'yes' }), { command: 'run', slug: 'checkout', story: null, base: null, fromArtifacts: false })
})

test('the slug is passed as typed: Init, not the parser, judges it', () => {
  assert.deepEqual(parseSkraftCommand('Not_A_Slug'), { command: 'run', slug: 'Not_A_Slug', story: null, base: null, fromArtifacts: false })
})

test('/skraft decide … is the decide command, never a slug', () => {
  assert.deepEqual(parseSkraftCommand('decide'), { command: 'decide', words: [] })
  assert.deepEqual(parseSkraftCommand('decide checkout key yes'), { command: 'decide', words: ['checkout', 'key', 'yes'] })
})

test('the tool input becomes a run; no slug resumes the active pipeline', () => {
  assert.deepEqual(toolRequest({}), { command: 'run', slug: null, story: null, base: null, fromArtifacts: false })
  assert.deepEqual(toolRequest(undefined), { command: 'run', slug: null, story: null, base: null, fromArtifacts: false })
  assert.deepEqual(toolRequest({ slug: '  ' }), { command: 'run', slug: null, story: null, base: null, fromArtifacts: false })
  assert.deepEqual(toolRequest({ slug: ' checkout ', issue: 42, title: ' Pay ' }), { command: 'run', slug: 'checkout', story: { issue: 42, title: 'Pay' }, base: null, fromArtifacts: false })
  assert.deepEqual(toolRequest({ slug: 'checkout', issue: 0, title: '' }), { command: 'run', slug: 'checkout', story: null, base: null, fromArtifacts: false })
  assert.deepEqual(toolRequest({ slug: 'checkout', issue: 4.5 }), { command: 'run', slug: 'checkout', story: null, base: null, fromArtifacts: false })
  assert.deepEqual(toolRequest({ slug: 'checkout', issue: '42', title: 7 }), { command: 'run', slug: 'checkout', story: null, base: null, fromArtifacts: false })
  assert.deepEqual(toolRequest({ slug: 'checkout', title: 'Pay' }), { command: 'run', slug: 'checkout', story: { issue: null, title: 'Pay' }, base: null, fromArtifacts: false })
  assert.deepEqual(toolRequest({ slug: 3 }), { command: 'run', slug: null, story: null, base: null, fromArtifacts: false })
})
