import { test } from 'node:test'
import assert from 'node:assert/strict'
import { API } from '../support/pipeline-host.mjs'
import { InMemoryRunLock } from '../support/in-memory-host.mjs'
import { createReviewPullRequest } from '../../../../plugins/skraft-framework/engine/application/review/review-pull-request-usecase.mjs'
import { createAdoptJournal } from '../../../../plugins/skraft-framework/engine/application/journal/adopt-usecase.mjs'
import { PULL_REQUEST, reviewHost, SLUG } from './support.mjs'

/** Why a review that lost its lease stops. */
const LOST = 'pr-12: this session no longer holds the lease of the review of pull request #12 (.copilot-tracking/skraft-reviews/pr-12/.lock): another session took it over, or renewing it failed; this review stops here and writes nothing more'

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
  assert.deepEqual(host.events().at(-1), { type: 'run.stopped', at: '2026-10-20T09:00:00.000Z', prev: host.events().at(-1).prev, code: 'agent-unavailable', reason: 'cold-reader-lens is not installed', sig: host.events().at(-1).sig })
  host.agentRunner.review = review

  const second = await host.review()

  assert.deepEqual([second.status, second.pass], ['APPROVED', 1])
  assert.deepEqual(asked(host, 1), ['cold-reader-lens'])
  assert.equal(host.events().filter((event) => event.type === 'step.started').length, 1)
})

test('a picked-up pass runs its lenses on what the base\'s configuration says now, never on what the journal holds', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  const review = host.agentRunner.review
  host.agentRunner.review = (dispatch) => (dispatch.agent === 'cold-reader-lens' ? { ok: false, text: '', unavailable: true, error: 'not installed' } : review(dispatch))
  await host.review()
  host.agentRunner.review = review
  host.git.holds('main-tip', { 'skraft-config.json': JSON.stringify({ components: [API], assign: { agents: { 'cold-reader-lens': 'frontier' } } }) })

  await host.review()

  assert.deepEqual(host.agentRunner.batches.at(-1).map(({ agent, model }) => [agent, model]), [['cold-reader-lens', 'frontier']])
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

test('a pass that stops after a finished one is picked up as that pass, not as a new one', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  await host.review()
  host.git.commit('feat: discount above 100 only', ['src/Threshold.cs'])
  pushed(host, 'root-2')
  const review = host.agentRunner.review
  host.agentRunner.review = () => ({ ok: false, text: '', unavailable: true, error: 'no agent host' })
  assert.deepEqual([(await host.review()).pass, host.events().at(-1).type], [2, 'run.stopped'])
  host.agentRunner.review = review

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.pass], ['APPROVED', 2])
  assert.deepEqual(host.events().filter((event) => event.type === 'step.started').map(({ visit }) => visit), [1, 2])
})

test('an error that is no journal conflict is not turned into an outcome', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  host.reviews.write = async () => { throw new Error('the disk is full') }

  await assert.rejects(host.review(), /the disk is full/)
})

test('the review journal is signed under a key of this machine, which its first line names', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])

  await host.review()

  const [id] = host.deps.journalKeys.keys.keys()
  assert.equal(host.events()[0].keyId, id)
  assert.ok(host.events().every((event) => /^[0-9a-f]+$/.test(event.sig)))
})

test('a machine with no home folder for the journal keys stops the review before any lens runs', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  host.deps.journalKeys.available = async () => false

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['stopped', 'journal-key-unavailable', 'the environment names no home folder (HOME or USERPROFILE), where the key that signs the review journal is kept; set it and review again'])
  assert.deepEqual(host.agentRunner.reviewed(), [])
  assert.deepEqual(host.events(), [])
})

/** A first pass journaled on another machine: this one holds none of its keys. */
const reviewedElsewhere = async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  await host.review()
  host.deps.journalKeys.keys.clear()
  host.git.commit('feat: more', ['src/More.cs'])
  pushed(host, 'root-2')
  return host
}

test('a review journal signed on another machine stops the review, unverifiable, until skraft journal adopt --pr signs it on from here', async () => {
  const host = await reviewedElsewhere()
  const before = host.events().length

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.code], ['stopped', 'journal-unverifiable'])
  assert.ok(outcome.reason.endsWith('restore it from the machine that started the run, or adopt the journal on this machine with skraft journal adopt --pr 12, typed in your own terminal (its earlier lines stay unverified)'), outcome.reason)
  assert.equal(host.agentRunner.batches.length, 1)
  const adoption = createAdoptJournal(host.deps)
  const shown = await adoption.preview({ pr: 12 })
  assert.deepEqual([shown.ok, shown.slug, shown.unverified], [true, SLUG, before])
  assert.match(shown.unverifiedLines, /^lines 1-\d+: 1 step\.started, /)
  const adopted = await adoption.adopt(shown, { pr: 12 })
  assert.deepEqual(adopted, { ok: true, slug: SLUG, code: 'adopted', reason: `${SLUG}: journal adopted with a new key of this machine; its ${before} earlier lines stay unverified` })
  assert.equal(host.events()[before].type, 'journal.adopted')
  assert.deepEqual([(await host.review()).pass, host.agentRunner.batches.length], [2, 2])
})

test('a review journal is adopted only as it was shown, and only once this machine cannot verify it', async () => {
  const host = await reviewedElsewhere()
  const adoption = createAdoptJournal(host.deps)
  const shown = await adoption.preview({ pr: 12 })

  const stale = await adoption.adopt({ ...shown, unverified: shown.unverified - 1 }, { pr: 12 })

  assert.deepEqual(stale, { ok: false, slug: SLUG, code: 'journal-changed', reason: `${SLUG}: the journal changed since you were shown what adopting it leaves unverified; run skraft journal adopt --pr 12 again` })
  await adoption.adopt(shown, { pr: 12 })
  assert.deepEqual((await adoption.preview({ pr: 12 })).code, 'journal-verified')
  assert.deepEqual(await adoption.preview({ pr: 7 }), { ok: false, slug: 'pr-7', code: 'not-initialised', reason: 'pr-7 has no journal (events.jsonl); review the pull request first with skraft review --pr 7' })
})

test('one review per pull request at a time: another session\'s live lease refuses the review before any lens runs', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  const other = new InMemoryRunLock(host.reviews, 'session-b')
  await other.create(SLUG, 'session-b 2026-10-20T08:59:50.000Z 2026-10-20T08:59:55.000Z\n')

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.code], ['stopped', 'pipeline-locked'])
  assert.equal(outcome.reason, 'another session is reviewing pull request #12; wait for it to end or for its lease to expire, then review again')
  assert.deepEqual(host.agentRunner.reviewed(), [])
})

test('the lease is released once the review ends, so the next run takes it again', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])

  await host.review()

  assert.equal(await host.deps.reviewLock.read(SLUG), null)
  assert.equal((await host.review()).pass, 2)
})

test('a review whose lease runs out while its lenses answer stops before it journals any more: lock-lost', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  const review = host.agentRunner.review
  host.agentRunner.review = (dispatch) => {
    host.deps.clock.sleep(120_000)
    return review(dispatch)
  }

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.code, outcome.pass, outcome.reason], ['stopped', 'lock-lost', null, LOST])
  assert.deepEqual(host.events().map(({ type }) => type), ['step.started'])
})

test('a lease the machine cannot write stops the review before any lens runs, naming the review\'s lock file', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  host.deps.reviewLock.read = async () => { throw new Error('EACCES') }

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['stopped', 'lock-unavailable', 'pr-12: this session cannot write the lease of the review of pull request #12 (.copilot-tracking/skraft-reviews/pr-12/.lock); check that the review folder is writable and that node starts on this machine'])
  assert.deepEqual(host.agentRunner.reviewed(), [])
})

/** Thrown by a runner that hands its agents to someone else. */
class Handed extends Error {}

test('a review that hands its agents over leaves its lease for them; taken back, it is refused once another session holds it', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  host.agentRunner.runMany = async () => { throw new Handed('handed over') }
  host.agentRunner.handedOver = (error) => (error instanceof Handed ? 3 : null)

  await assert.rejects(host.review(), Handed)

  assert.match(await host.deps.reviewLock.read(SLUG), /^session-a /)
  host.deps.clock.sleep(30 * 60_000)
  const other = new InMemoryRunLock(host.reviews, 'session-b')
  await other.replace(SLUG, await other.read(SLUG), `session-b ${host.deps.clock.now().toISOString()} ${host.deps.clock.now().toISOString()}\n`)
  const taken = await createReviewPullRequest(host.deps).review({ number: 12, publish: false, workingCopyName: 'shop', handedBack: true })

  assert.deepEqual([taken.status, taken.code, taken.reason], ['stopped', 'lock-lost', LOST])
  const again = await host.review()
  assert.deepEqual([again.status, again.code, again.reason], ['stopped', 'pipeline-locked', 'another session is reviewing pull request #12; wait for it to end or for its lease to expire, then review again'])
})

test('an error that is no hand-over releases the lease', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  host.agentRunner.runMany = async () => { throw new Error('the host broke') }
  host.agentRunner.handedOver = (error) => (error instanceof Handed ? 3 : null)

  await assert.rejects(host.review(), /the host broke/)

  assert.equal(await host.deps.reviewLock.read(SLUG), null)
})
