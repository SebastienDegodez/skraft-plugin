import { test } from 'node:test'
import assert from 'node:assert/strict'
import { API } from '../support/pipeline-host.mjs'
import { finding, lenses, PULL_REQUEST, REVIEWS, reviewHost, says, SLUG, TEST_FILE, weakensAssertion } from './support.mjs'

const CONSENT = 'May skraft keep one comment on the pull request it reviews with skraft review --pr --publish, rewritten at each review, with the verdict and the findings? It is posted as you. ACCEPTED or DECLINED; the answer is kept in skraft-config.json (publish.reviewComment) for every later review.'
const URL = 'https://github.example.com/acme/shop/pull/12#issuecomment-901'

/** A pull request whose head commit the working copy stands on. @param {Parameters<typeof reviewHost>[0]} [options] */
const reviewed = (options) => {
  const host = reviewHost(options)
  weakensAssertion(host.git)
  return host
}

/** The pull request's head moved to the working copy's last commit. @param {ReturnType<typeof reviewHost>} host @param {string} sha */
const pushed = (host, sha) => { host.pullRequests.pullRequests[0] = { ...PULL_REQUEST, head: { ref: 'discount', sha } } }

test('--publish twice keeps one comment on the pull request, rewritten with each pass; the consent is asked once and kept in skraft-config.json', async () => {
  const host = reviewed({ answers: [{ answer: 'ACCEPTED' }] })
  host.agentRunner.review = lenses({ 'test-integrity': [says('test-integrity', 'fail', [finding('F1', 'blocker', 'the assertion @alice wrote is gone', { gate: 'G9', location: `${TEST_FILE}:14` })])] })

  const first = await host.review({ publish: true })

  assert.deepEqual([first.status, first.comment, first.unpublished], ['NEEDS_REWORK', URL, null])
  assert.deepEqual(host.human.questions.map(({ key, kind, text, options, header }) => [key, kind, text, options, header]), [['review_consent-1', 'review-consent', CONSENT, ['ACCEPTED', 'DECLINED'], 'Review comment']])
  assert.deepEqual(host.workspace.config().publish, { reviewComment: true, questionVersions: { reviewComment: 1 } })
  assert.deepEqual(host.workspace.config().components, [API])
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

  const reason = 'not published: skraft-config.json sets publish.reviewComment to false'
  assert.deepEqual([first.status, first.comment, first.unpublished], ['APPROVED', null, reason])
  assert.equal(host.workspace.config().publish.reviewComment, false)
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
  assert.equal(host.workspace.config().publish, undefined)
  assert.deepEqual(host.pullRequests.comments, [])
  assert.deepEqual(host.events().filter((event) => event.type === 'question.answered'), [])
})

test('an answer the question does not take keeps nothing and posts nothing', async () => {
  const host = reviewed({ answers: [{ answer: 'MAYBE' }] })

  const outcome = await host.review({ publish: true })

  assert.equal(outcome.unpublished, 'not published: nobody answered review_consent-1; run skraft review --pr 12 --publish where you can answer it')
  assert.equal(host.workspace.config().publish, undefined)
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
