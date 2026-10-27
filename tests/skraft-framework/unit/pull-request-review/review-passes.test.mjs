import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PULL_REQUEST, reviewHost, SLUG } from './support.mjs'

/** The pull request's head moved to the working copy's last commit. @param {ReturnType<typeof reviewHost>} host @param {string} sha */
const pushed = (host, sha) => { host.pullRequests.pullRequests[0] = { ...PULL_REQUEST, head: { ref: 'discount', sha } } }

/** The lens agents asked in a batch. @param {ReturnType<typeof reviewHost>} host @param {number} index */
const asked = (host, index) => host.agentRunner.batches[index].map(({ agent }) => agent)

test('a second pass after a commit that touches one file runs again only the lenses whose inputs changed; the others are taken over', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  host.git.adds('src/Discount.cs', 'public decimal Apply(decimal total) => total * 0.9m;')
  await host.review()
  host.git.commit('docs: record the discount decision', ['docs/adr/adr-002-discount.md'])
  host.git.adds('docs/adr/adr-002-discount.md', '# ADR-002: discount above 100')
  pushed(host, 'root-2')

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.pass], ['APPROVED', 2])
  assert.deepEqual(asked(host, 1), ['test-integrity-lens', 'architecture-boundaries-lens'])
  const second = host.events().filter((event) => event.type === 'review.lens' && event.visit === 2)
  assert.deepEqual(second.map(({ lens, reused }) => [lens, reused]), [['cold-reader', true], ['test-integrity', undefined], ['architecture-boundaries', undefined]])
  assert.equal(host.events().filter((event) => event.type === 'step.started').at(-1).head, 'root-2')
  assert.ok((await host.reviews.read(SLUG, 'reviews/verdict-2/verdict.yaml')).endsWith('reused:\n  - lens: "cold-reader"\n'))
})

test('a pass the host stopped is picked up by the next run, which asks only the lenses it lacks, with the families it journaled', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  const unavailable = { ok: false, text: '', unavailable: true, error: 'cold-reader-lens is not installed' }
  const review = host.agentRunner.review
  host.agentRunner.review = (dispatch) => (dispatch.agent === 'cold-reader-lens' ? unavailable : review(dispatch))

  const first = await host.review()

  assert.deepEqual([first.status, first.pass, first.code, first.reason], ['stopped', 1, 'agent-unavailable', 'cold-reader-lens is not installed'])
  assert.deepEqual(host.events().at(-1), { type: 'run.stopped', at: '2026-10-20T09:00:00.000Z', prev: host.events().at(-1).prev, code: 'agent-unavailable', reason: 'cold-reader-lens is not installed' })
  host.agentRunner.review = review

  const second = await host.review()

  assert.deepEqual([second.status, second.pass], ['APPROVED', 1])
  assert.deepEqual(asked(host, 1), ['cold-reader-lens'])
  assert.equal(host.events().filter((event) => event.type === 'step.started').length, 1)
})

test('a journal someone edited stops the review with the line it breaks at', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  await host.review()
  host.reviews.rewriteJournal(SLUG, (lines) => [lines[0].replace('"visit":1', '"visit":3'), ...lines.slice(1)])

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.code, outcome.pass], ['stopped', 'journal-tampered', null])
  assert.match(outcome.reason, /events\.jsonl/)
})

test('a journal another run writes to meanwhile stops the review: journal-changed', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  const review = host.agentRunner.review
  host.agentRunner.review = async (dispatch) => {
    await host.reviews.append(SLUG, '{"type":"other"}')
    host.agentRunner.review = review
    return review(dispatch)
  }

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.code, outcome.pass], ['stopped', 'journal-changed', null])
  assert.match(outcome.reason, /another run wrote events\.jsonl meanwhile/)
})
