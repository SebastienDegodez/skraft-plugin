import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AZURE_PULL_REQUEST, finding, lenses, reviewHost, says, TEST_FILE, weakensAssertion } from '../pull-request-review/support.mjs'

const REPOSITORY = 'dev.azure.com/acme/Shop Team/payment'
const THREAD = 'https://dev.azure.com/acme/Shop%20Team/_git/payment/pull/12#issuecomment-901'

/** A review of pull request 12 on Azure Repos, through az, whose head commit weakens an assertion. @param {Parameters<typeof reviewHost>[0]} [options] */
const reviewed = (options = {}) => {
  const host = reviewHost({ azure: true, answers: [{ answer: 'ACCEPTED' }], ...options })
  weakensAssertion(host.git)
  host.agentRunner.review = lenses({ 'test-integrity': [says('test-integrity', 'fail', [finding('F1', 'blocker', 'the assertion @alice wrote is gone', { gate: 'G9', location: `${TEST_FILE}:14` })])] })
  return host
}

test('a review of pull request 12 on Azure Repos gives NEEDS_REWORK on the weakened assertion and keeps one thread through az, rewritten at pass 2; the journal names no route', async () => {
  const host = reviewed()

  const first = await host.review({ publish: true })

  assert.deepEqual([first.status, first.comment, first.unpublished], ['NEEDS_REWORK', THREAD, null])
  assert.deepEqual(host.userSettings.json(), { reviewComments: { [REPOSITORY]: { accepted: true, questionVersion: 1 } } })
  host.git.commit('test: restore the discount check', [TEST_FILE])
  host.pullRequests.pullRequests[0] = { ...AZURE_PULL_REQUEST, head: { ref: 'discount', sha: 'root-2' } }
  const second = await host.review({ publish: true })

  assert.deepEqual([second.status, second.pass, second.comment], ['APPROVED', 2, THREAD])
  assert.equal(host.pullRequests.comments.length, 1)
  assert.ok(host.pullRequests.comments[0].body.startsWith('### skraft review · #12 — APPROVED (pass 2)\n'), host.pullRequests.comments[0].body)
  const commented = host.events().filter((event) => event.type === 'review.commented')
  assert.deepEqual(commented.map(({ pass, url, via, fallback }) => [pass, url, via, fallback]), [[1, THREAD, undefined, undefined], [2, THREAD, undefined, undefined]])
})

test('the comment is also kept as the JSON requests az sends, a new thread Closed and the rewrite of its first comment; on GitHub no such file is written', async () => {
  const azure = reviewed()
  await azure.review({ publish: true })
  const body = await azure.reviews.read('pr-12', 'comment.md')

  assert.equal(await azure.reviews.read('pr-12', 'comment.thread.json'), JSON.stringify({ comments: [{ parentCommentId: 0, content: body, commentType: 1 }], status: 4 }))
  assert.equal(await azure.reviews.read('pr-12', 'comment.content.json'), JSON.stringify({ content: body }))
  const github = reviewHost({ answers: [{ answer: 'ACCEPTED' }] })
  weakensAssertion(github.git)
  await github.review({ publish: true })
  assert.deepEqual((await github.reviews.list('pr-12', '')).filter((file) => file.startsWith('comment.') && file.endsWith('.json')), [])
})

test('a base the working copy lacks says what to fetch, by the branch\'s short name', async () => {
  const host = reviewHost({ azure: true, pullRequest: { ...AZURE_PULL_REQUEST, base: { ref: 'release', sha: 'release-tip' } } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  const outcome = await host.review()

  assert.deepEqual([outcome.code, outcome.reason], ['pr-base-missing', 'Git finds no merge base with release at release-tip; fetch it first: git fetch origin release'])
})

test('a review of a pull request on Azure Repos says how to check it out with az, not with gh', async () => {
  const host = reviewHost({ azure: true, pullRequest: { ...AZURE_PULL_REQUEST, head: { ref: 'discount', sha: 'root-9' } } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['stopped', 'pr-not-checked-out', 'the working copy is not on the head of pull request #12 (root-9); check it out first: az repos pr checkout --id 12'])
})
