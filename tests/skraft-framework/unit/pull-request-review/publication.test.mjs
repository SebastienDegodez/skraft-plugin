import { test } from 'node:test'
import assert from 'node:assert/strict'
import { API } from '../support/pipeline-host.mjs'
import { finding, lenses, PULL_REQUEST, REVIEWS, reviewHost, says, SLUG, TEST_FILE, weakensAssertion } from './support.mjs'

const CONSENT = 'May skraft keep one comment on the pull request it reviews with skraft review --pr --publish, rewritten at each review, with the verdict and the findings? It is posted as you. ACCEPTED or DECLINED; the answer is kept in ~/.skraft/config.json for this repository, for every later review.'
const URL = 'https://github.example.com/acme/shop/pull/12#issuecomment-901'
const KEPT = (accepted) => ({ reviewComments: { 'github.com/acme/shop': { accepted, questionVersion: 1 } } })

/** A pull request whose head commit the working copy stands on. @param {Parameters<typeof reviewHost>[0]} [options] */
const reviewed = (options) => {
  const host = reviewHost(options)
  weakensAssertion(host.git)
  return host
}

/** The pull request's head moved to the working copy's last commit. @param {ReturnType<typeof reviewHost>} host @param {string} sha */
const pushed = (host, sha) => { host.pullRequests.pullRequests[0] = { ...PULL_REQUEST, head: { ref: 'discount', sha } } }

test('--publish twice keeps one comment on the pull request, rewritten with each pass; the consent is asked once and kept in ~/.skraft/config.json for the repository, nothing written in the working copy', async () => {
  const host = reviewed({ answers: [{ answer: 'ACCEPTED' }] })
  host.agentRunner.review = lenses({ 'test-integrity': [says('test-integrity', 'fail', [finding('F1', 'blocker', 'the assertion @alice wrote is gone', { gate: 'G9', location: `${TEST_FILE}:14` })])] })

  const first = await host.review({ publish: true })

  assert.deepEqual([first.status, first.comment, first.unpublished], ['NEEDS_REWORK', URL, null])
  assert.deepEqual(host.human.questions.map(({ key, kind, text, options, header }) => [key, kind, text, options, header]), [['review_consent-1', 'review-consent', CONSENT, ['ACCEPTED', 'DECLINED'], 'Review comment']])
  assert.deepEqual(host.userSettings.json(), KEPT(true))
  assert.equal(await host.workspace.read('skraft-config.json'), null)
  assert.equal(host.pullRequests.comments[0].body, [
    '### skraft review · #12 — NEEDS_REWORK (pass 1)', '',
    'NEEDS_REWORK: 1 reason to address', '',
    'To address:',
    `- test-integrity F1 G9 blocker at ${TEST_FILE}:14: the assertion \`@alice\` wrote is gone`, '',
    '<sub>skraft-review pr=12</sub>', '',
  ].join('\n'))
  assert.equal(await host.reviews.read(SLUG, 'comment.md'), host.pullRequests.comments[0].body)

  host.git.commit('test: restore the discount check', [TEST_FILE])
  pushed(host, 'root-2')
  const second = await host.review({ publish: true })

  assert.deepEqual([second.status, second.pass, second.comment], ['APPROVED', 2, URL])
  assert.equal(host.pullRequests.comments.length, 1)
  assert.ok(host.pullRequests.comments[0].body.startsWith('### skraft review · #12 — APPROVED (pass 2)\n\nAPPROVED: every lens passed\n\n<sub>skraft-review pr=12</sub>\n'), host.pullRequests.comments[0].body)
  assert.equal(host.human.questions.length, 1)
  assert.deepEqual(host.pullRequests.calls.filter((call) => call.startsWith('keep')), ['keep comment #12', 'keep comment #12 #issuecomment-901'])
  const kept = host.events().filter((event) => event.type.startsWith('question.') || event.type.startsWith('review.comment'))
  assert.deepEqual(kept.map(({ type, key, answer, by, pass, url }) => [type, key, answer, by, pass, url]), [
    ['question.asked', 'review_consent-1', undefined, undefined, undefined, undefined],
    ['question.answered', 'review_consent-1', 'ACCEPTED', 'host', undefined, undefined],
    ['review.commented', undefined, undefined, undefined, 1, URL],
    ['review.commented', undefined, undefined, undefined, 2, URL],
  ])
})

test('a consent declined at the host is kept, nothing is posted, and a later --publish asks nothing', async () => {
  const host = reviewed({ answers: [{ answer: 'declined' }] })

  const first = await host.review({ publish: true })

  const reason = 'not published: you declined to keep a review comment on github.com/acme/shop (~/.skraft/config.json)'
  assert.deepEqual([first.status, first.comment, first.unpublished], ['APPROVED', null, reason])
  assert.deepEqual(host.userSettings.json(), KEPT(false))
  assert.deepEqual(host.events().at(-1), { type: 'review.comment-skipped', at: '2026-10-20T09:00:00.000Z', prev: host.events().at(-1).prev, pass: 1, reason })

  const second = await host.review({ publish: true })

  assert.equal(second.unpublished, reason)
  assert.equal(host.human.questions.length, 1)
  assert.deepEqual(host.pullRequests.comments, [])
})

test('a consent nobody answers keeps nothing and posts nothing; the verdict stands', async () => {
  const host = reviewed()

  const outcome = await host.review({ publish: true })

  assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['APPROVED', null, 'not published: nobody answered review_consent-1; run skraft review --pr 12 --publish where you can answer it'])
  assert.equal(host.userSettings.text, null)
  assert.deepEqual(host.pullRequests.comments, [])
  assert.deepEqual(host.events().filter((event) => event.type === 'question.answered'), [])

  const again = await host.review({ publish: true })

  assert.equal(again.unpublished, 'not published: nobody answered review_consent-2; run skraft review --pr 12 --publish where you can answer it')
  assert.deepEqual(host.human.questions.map(({ key }) => key), ['review_consent-1', 'review_consent-2'])
})

test('an answer the question does not take keeps nothing and posts nothing', async () => {
  const host = reviewed({ answers: [{ answer: 'MAYBE' }] })

  const outcome = await host.review({ publish: true })

  assert.equal(outcome.unpublished, 'not published: nobody answered review_consent-1; run skraft review --pr 12 --publish where you can answer it')
  assert.equal(host.userSettings.text, null)
})

test('a fork with no skraft-config.json: --publish writes nothing in the working copy, and the second pass is not asked again', async () => {
  const host = reviewed({ config: null, answers: [{ answer: 'ACCEPTED' }], user: '{ "models": {} }' })
  const before = [...host.workspace.files.entries()]

  await host.review({ publish: true })
  host.git.commit('test: restore the discount check', [TEST_FILE])
  pushed(host, 'root-2')
  const second = await host.review({ publish: true })

  assert.equal(second.comment, URL)
  assert.equal(host.human.questions.length, 1)
  assert.deepEqual([...host.workspace.files.entries()], before)
  assert.deepEqual(host.userSettings.json(), { models: {}, ...KEPT(true) })
})

test('an answer kept for another repository, or for an earlier question, is no answer for this one', async () => {
  const other = { reviewComments: { 'github.com/acme/other': { accepted: true, questionVersion: 1 }, 'github.com/acme/shop': { accepted: true, questionVersion: 0 } } }
  const host = reviewed({ user: JSON.stringify(other), answers: [{ answer: 'ACCEPTED' }] })

  await host.review({ publish: true })

  assert.equal(host.human.questions.length, 1)
  assert.deepEqual(host.userSettings.json().reviewComments, { 'github.com/acme/other': { accepted: true, questionVersion: 1 }, 'github.com/acme/shop': { accepted: true, questionVersion: 1 } })
})

test('the repository\'s skraft-config.json answer wins over the developer\'s: false posts nothing, true posts without asking', async () => {
  const refused = reviewed({ config: { components: [API], publish: { reviewComment: false } }, user: JSON.stringify(KEPT(true)) })
  const allowed = reviewed({ config: { components: [API], publish: { reviewComment: true } }, user: JSON.stringify(KEPT(false)) })

  const no = await refused.review({ publish: true })
  const yes = await allowed.review({ publish: true })

  assert.deepEqual([no.comment, no.unpublished], [null, 'not published: skraft-config.json sets publish.reviewComment to false'])
  assert.deepEqual([yes.comment, yes.unpublished], [URL, null])
  assert.deepEqual([refused.human.questions, allowed.human.questions], [[], []])
})

test('a forge that cannot name the repository keeps no consent and posts nothing', async () => {
  const host = reviewed({ forge: { repository: null } })

  const outcome = await host.review({ publish: true })

  assert.equal(outcome.unpublished, 'not published: the forge does not name the repository of the working copy\'s remote, so no consent can be kept for it')
  assert.deepEqual(host.human.questions, [])
})

test('a consent already given posts at once; a forge that refuses the comment leaves the verdict and says why', async () => {
  const host = reviewed({ config: { components: [API], publish: { reviewComment: true } }, forge: { fails: { comment: 'gh could not comment issue #12 on acme/shop' } } })

  const outcome = await host.review({ publish: true })

  assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['APPROVED', null, 'not published: gh could not comment issue #12 on acme/shop'])
  assert.deepEqual(host.human.questions, [])
  assert.equal(host.events().at(-1).type, 'review.comment-skipped')
})

test('without --publish the comment is only rendered beside the review: no consent asked, nothing posted', async () => {
  const host = reviewed()

  const outcome = await host.review()

  assert.deepEqual([outcome.comment, outcome.unpublished], [null, null])
  assert.ok((await host.reviews.read(SLUG, 'comment.md')).startsWith('### skraft review · #12 — APPROVED (pass 1)\n'))
  assert.deepEqual(host.human.questions, [])
  assert.deepEqual(host.pullRequests.calls, ['unavailable', 'find #12'])
  assert.equal(outcome.file, `${REVIEWS}/reviews/verdict-1/verdict.yaml`)
})

test('a stopped review publishes nothing', async () => {
  const host = reviewed({ config: { components: [API], publish: { reviewComment: true } } })
  host.agentRunner.review = () => ({ ok: false, text: '', unavailable: true, error: 'the host has no agents' })

  const outcome = await host.review({ publish: true })

  assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['stopped', null, null])
  assert.deepEqual(host.pullRequests.comments, [])
})

test('the comment lists what does not send the work back under Not counted', async () => {
  const host = reviewed({ config: { components: [API], publish: { reviewComment: true } } })
  host.agentRunner.review = lenses({ 'cold-reader': [says('cold-reader', 'pass', [finding('F1', 'low', 'name the total', { gate: 'C2' })])] })

  await host.review({ publish: true })

  assert.ok(host.pullRequests.comments[0].body.includes('\n\nNot counted:\n- note: cold-reader F1 C2 low at src/Checkout.cs:12: name the total\n\n<sub>skraft-review pr=12</sub>\n'), host.pullRequests.comments[0].body)
})
