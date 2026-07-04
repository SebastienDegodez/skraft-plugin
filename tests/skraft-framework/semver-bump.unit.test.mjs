import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bumpFromCommits, nextVersion } from '../../scripts/lib/semver-bump.mjs'

// bumpFromCommits ————————————————————————————————————————————————————

test('bumpFromCommits: feat commits yield minor', () => {
  assert.equal(bumpFromCommits(['feat(freshness): add gate', 'docs: readme']), 'minor')
})

test('bumpFromCommits: fix/perf/refactor commits yield patch', () => {
  assert.equal(bumpFromCommits(['fix: broken route']), 'patch')
  assert.equal(bumpFromCommits(['perf(hook): faster parse']), 'patch')
  assert.equal(bumpFromCommits(['refactor: extract policy']), 'patch')
})

test('bumpFromCommits: BREAKING CHANGE or bang yields major', () => {
  assert.equal(bumpFromCommits(['feat!: new config layout']), 'major')
  assert.equal(bumpFromCommits(['feat(scope)!: new layout']), 'major')
  assert.equal(bumpFromCommits(['fix: x\n\nBREAKING CHANGE: config schema']), 'major')
})

test('bumpFromCommits: major wins over minor wins over patch', () => {
  assert.equal(bumpFromCommits(['fix: a', 'feat: b']), 'minor')
  assert.equal(bumpFromCommits(['feat: b', 'fix!: c']), 'major')
})

test('bumpFromCommits: docs/chore/test-only commits yield null (no release)', () => {
  assert.equal(bumpFromCommits(['docs: handbook', 'chore: deps', 'test: more cases']), null)
})

test('bumpFromCommits: empty list yields null', () => {
  assert.equal(bumpFromCommits([]), null)
})

// nextVersion ————————————————————————————————————————————————————————

test('nextVersion: applies major/minor/patch and resets lower parts', () => {
  assert.equal(nextVersion('1.2.3', 'major'), '2.0.0')
  assert.equal(nextVersion('1.2.3', 'minor'), '1.3.0')
  assert.equal(nextVersion('1.2.3', 'patch'), '1.2.4')
})

test('nextVersion: null bump returns null', () => {
  assert.equal(nextVersion('1.2.3', null), null)
})
