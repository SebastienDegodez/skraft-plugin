import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_REVIEW, InMemoryAgentCatalog, PLUGIN_AGENTS } from '../support/in-memory-host.mjs'
import { edit } from '../workflow/support.mjs'
import { PULL_REQUEST, reviewHost, SLUG } from './support.mjs'

/** What the review stopped with, and that it started no lens and wrote no journal. @param {ReturnType<typeof reviewHost>} host */
const stoppedBefore = async (host) => {
  const outcome = await host.review()
  assert.deepEqual(host.agentRunner.reviewed(), [])
  assert.deepEqual(await host.reviews.list(SLUG, ''), [])
  return [outcome.status, outcome.code, outcome.reason, outcome.pass]
}

test('gh not signed in: a named stop, no lens started, nothing journaled', async () => {
  const host = reviewHost({ forge: { unavailable: 'gh is not signed in to github.example.com; run gh auth login --hostname github.example.com' } })

  assert.deepEqual(await stoppedBefore(host), ['stopped', 'forge-unavailable', 'gh is not signed in to github.example.com; run gh auth login --hostname github.example.com', null])
  assert.deepEqual(host.pullRequests.calls, ['unavailable'])
})

test('a pull request the forge does not have: a named stop, no lens started', async () => {
  const host = reviewHost({ pullRequest: { ...PULL_REQUEST, number: 7 } })

  const outcome = await host.review()

  assert.deepEqual(outcome, { status: 'stopped', number: 12, pass: null, code: 'pr-not-found', reason: 'the forge has no pull request #12', reasons: [], details: [], file: null, comment: null, unpublished: null })
})

test('a pull request gh cannot read: a named stop with the adapter\'s reason', async () => {
  const host = reviewHost({ forge: { fails: { read: 'gh could not read pull request #12 of acme/shop' } } })

  assert.deepEqual(await stoppedBefore(host), ['stopped', 'pr-unreadable', 'gh could not read pull request #12 of acme/shop', null])
})

test('a working copy that is not on the pull request\'s head: a named stop that says how to check it out', async () => {
  const host = reviewHost({ pullRequest: { ...PULL_REQUEST, head: { ref: 'discount', sha: 'root-9' } } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  assert.deepEqual(await stoppedBefore(host), ['stopped', 'pr-not-checked-out', 'the working copy is not on the head of pull request #12 (root-9); check it out first: gh pr checkout 12', null])
})

test('a base Git cannot find: a named stop that says what to fetch', async () => {
  const host = reviewHost({ pullRequest: { ...PULL_REQUEST, base: { ref: 'release', sha: 'release-tip' } } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  assert.deepEqual(await stoppedBefore(host), ['stopped', 'pr-base-missing', 'Git finds no merge base with release at release-tip; fetch it first: git fetch origin release', null])
})

test('a working copy with uncommitted changes stops the review before any lens runs, naming them; the review\'s own folder does not count', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  host.git.change('src/Local.cs', 'tests/Draft.cs', '.copilot-tracking/skraft-reviews/pr-12/events.jsonl')

  assert.deepEqual(await stoppedBefore(host), ['stopped', 'working-copy-dirty', 'the working copy has uncommitted changes (src/Local.cs, tests/Draft.cs); commit or stash them, then review again', null])
})

test('a working copy Git cannot tell the changes of stops the review before any lens runs', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  host.git.changedFiles = async () => null

  assert.deepEqual(await stoppedBefore(host), ['stopped', 'working-copy-dirty', 'Git could not tell whether the working copy has uncommitted changes; check git status, then review again', null])
})

test('an invalid skraft-config.json at the base stops the review before any lens runs', async () => {
  const host = reviewHost({ config: { components: 'none' } })

  host.git.commit('feat: discount', ['src/Discount.cs'])

  assert.deepEqual(await stoppedBefore(host), ['stopped', 'config-invalid', 'skraft-config.json is invalid: components must be an array', null])
})

test('an ejected review.skraft.dot at the base without test-integrity is refused before any lens runs: the node is mandatory', async () => {
  const review = edit(BUILT_IN_REVIEW, ['  test_integrity          [shape=note, lens="test-integrity", mandatory=true]\n', ''], ['  lenses -> test_integrity -> verdict\n', ''])
  const host = reviewHost({ base: { '.skraft/review.skraft.dot': review } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  const [status, code, reason] = await stoppedBefore(host)

  assert.deepEqual([status, code], ['stopped', 'workflow-invalid'])
  assert.equal(reason, 'the review workflow is invalid: mandatory node test_integrity (lens test-integrity between lenses and verdict of review) is missing; this node is mandatory and cannot be removed')
})

test('a lens agent nobody provides is refused before any lens runs', async () => {
  const host = reviewHost({ catalog: new InMemoryAgentCatalog({ plugin: PLUGIN_AGENTS.filter((agent) => agent !== 'cold-reader-lens') }) })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  const [, code, reason] = await stoppedBefore(host)

  assert.deepEqual([code, reason], ['workflow-invalid', 'the review workflow is invalid: node verdict: lens cold-reader (agent cold-reader-lens) not found in the plugin, .claude/agents/ or .github/agents/'])
})

test('an ejected review.skraft.dot that does not parse is refused with what is wrong', async () => {
  const host = reviewHost({ base: { '.skraft/review.skraft.dot': 'digraph review {' } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  const [, code, reason] = await stoppedBefore(host)

  assert.equal(code, 'workflow-invalid')
  assert.ok(reason.startsWith('the review workflow is invalid: .skraft/review.skraft.dot: '), reason)
})

test('every mandatory node an ejected copy drops is named, one reason after the other', async () => {
  const review = edit(BUILT_IN_REVIEW,
    ['  test_integrity          [shape=note, lens="test-integrity", mandatory=true]\n', ''], ['  lenses -> test_integrity -> verdict\n', ''],
    ['  architecture_boundaries [shape=note, lens="architecture-boundaries", mandatory=true]\n', ''], ['  lenses -> architecture_boundaries -> verdict\n', ''])
  const host = reviewHost({ base: { '.skraft/review.skraft.dot': review } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  const [, code, reason] = await stoppedBefore(host)

  assert.equal(code, 'workflow-invalid')
  assert.equal(reason, 'the review workflow is invalid: mandatory node test_integrity (lens test-integrity between lenses and verdict of review) is missing; this node is mandatory and cannot be removed; mandatory node architecture_boundaries (lens architecture-boundaries between lenses and verdict of review) is missing; this node is mandatory and cannot be removed')
})
