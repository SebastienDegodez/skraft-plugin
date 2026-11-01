import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide, nextVersion } from '../../../eng/cli-next-version.mjs'

const DRY_RUN = `[9:15:09 PM] [semantic-release] › ✔  Run automated release from branch integration/v2-next
[9:15:10 PM] [semantic-release] › ℹ  The next release version is 1.0.0-alpha.2
[9:15:10 PM] [semantic-release] › ⚠  Skip step "prepare" of plugin "@semantic-release/exec" in dry-run mode`

test('a version semantic-release announces and npm has never seen is published', () => {
  const version = nextVersion(DRY_RUN)
  assert.equal(version, '1.0.0-alpha.2')
  assert.deepEqual(decide({ version, published: false }), { publish: true, reason: '@skraft/cli@1.0.0-alpha.2 has never been published' })
})

test('a version npm already has is never published again', () => {
  assert.deepEqual(decide({ version: '1.0.0-alpha.2', published: true }), { publish: false, reason: '@skraft/cli@1.0.0-alpha.2 is already on npm' })
})

test('without a cli/ commit asking for a release, nothing is published', () => {
  const version = nextVersion('[semantic-release] › ℹ  There are no relevant changes, so no new version is released.')
  assert.equal(version, null)
  assert.deepEqual(decide({ version, published: false }), { publish: false, reason: 'no cli/ commit asks for a release' })
})
