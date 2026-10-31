import { test } from 'node:test'
import assert from 'node:assert/strict'
import { azureJsonOf, AZURE_PULL_REQUEST, finding, lenses, reviewHost, says, TEST_FILE, weakensAssertion } from '../pull-request-review/support.mjs'

const REPOSITORY = 'dev.azure.com/acme/Shop Team/payment'
const THREAD = 'https://dev.azure.com/acme/Shop%20Team/_apis/git/repositories/payment/pullRequests/12/threads/41/comments/1'

/** A review of pull request 12 on Azure Repos, whose head commit weakens an assertion; the host's Azure DevOps MCP server is connected unless `mcp` says otherwise. @param {Parameters<typeof reviewHost>[0]} [options] */
const reviewed = (options = {}) => {
  const host = reviewHost({ azure: true, mcp: {}, answers: [{ answer: 'ACCEPTED' }], ...options })
  weakensAssertion(host.git)
  host.agentRunner.review = lenses({ 'test-integrity': [says('test-integrity', 'fail', [finding('F1', 'blocker', 'the assertion @alice wrote is gone', { gate: 'G9', location: `${TEST_FILE}:14` })])] })
  return host
}

/** The comment events of the journal, as a person reads them: the pass, the way it went and why. @param {ReturnType<typeof reviewed>} host */
const commentEvents = (host) => host.events().filter((event) => event.type.startsWith('review.comment')).map(({ type, pass, via, fallback, reason }) => ({ type, pass, via, fallback, reason }))

/** Which way each comment was kept: the way and why az served, if it did. @param {ReturnType<typeof reviewed>} host */
const routes = (host) => commentEvents(host).map(({ via, fallback }) => [via, fallback])

test('with the host\'s Azure DevOps MCP server, a review of pull request 12 on Azure Repos reads it, gives NEEDS_REWORK on the weakened assertion and keeps one thread, rewritten at pass 2, which journals that the server served; az is asked nothing', async () => {
  const host = reviewed()

  const first = await host.review({ publish: true })

  assert.deepEqual([first.status, first.comment, first.unpublished], ['NEEDS_REWORK', THREAD, null])
  assert.equal(host.mcp.threads.length, 1)
  assert.equal(host.mcp.threads[0].status, 'Closed')
  const firstBody = await host.reviews.read('pr-12', 'comment.md')
  assert.equal(host.mcp.threads[0].comments[0].content, firstBody)
  assert.deepEqual(host.userSettings.json(), { reviewComments: { [REPOSITORY]: { accepted: true, questionVersion: 1 } } })

  host.git.commit('test: restore the discount check', [TEST_FILE])
  host.mcp.pullRequests[12] = azureJsonOf({ ...AZURE_PULL_REQUEST, head: { ref: 'discount', sha: 'root-2' } })
  const second = await host.review({ publish: true })

  assert.deepEqual([second.status, second.pass, second.comment], ['APPROVED', 2, THREAD])
  assert.equal(host.mcp.threads.length, 1)
  assert.ok(host.mcp.threads[0].comments[0].content.startsWith('### skraft review · #12 — APPROVED (pass 2)\n'), host.mcp.threads[0].comments[0].content)
  assert.deepEqual(host.mcp.requests.map(({ tool, arguments: args }) => [tool, args.action]), [
    ['repo_pull_request', 'get'], ['repo_pull_request', 'get'], ['repo_pull_request_thread', 'list'], ['repo_pull_request_thread_write', 'create'],
    ['repo_pull_request', 'get'], ['repo_pull_request', 'get'], ['repo_pull_request_thread', 'list'], ['repo_pull_request_thread_write', 'update'],
  ])
  assert.deepEqual(host.mcp.requests[0].arguments, { action: 'get', repositoryId: 'payment', project: 'Shop Team', pullRequestId: 12 })
  assert.deepEqual(host.mcp.requests[2].arguments, { action: 'list', repositoryId: 'payment', project: 'Shop Team', pullRequestId: 12, fullResponse: true })
  assert.deepEqual(host.mcp.requests[3].arguments, { action: 'create', repositoryId: 'payment', project: 'Shop Team', pullRequestId: 12, content: firstBody, status: 'Closed' })
  assert.deepEqual(host.mcp.requests[7].arguments, { action: 'update', repositoryId: 'payment', project: 'Shop Team', pullRequestId: 12, threadId: 41, commentId: 1, content: host.mcp.threads[0].comments[0].content, fullResponse: true })
  assert.deepEqual(host.pullRequests.calls, [])
  const commented = host.events().filter((event) => event.type === 'review.commented')
  assert.deepEqual(commented.map(({ pass, url, via, fallback }) => [pass, url, via, fallback]), [[1, THREAD, 'mcp', undefined], [2, THREAD, 'mcp', undefined]])
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
  const host = reviewHost({ azure: true, mcp: {}, pullRequest: { ...AZURE_PULL_REQUEST, base: { ref: 'release', sha: 'release-tip' } } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  const outcome = await host.review()

  assert.deepEqual([outcome.code, outcome.reason], ['pr-base-missing', 'Git finds no merge base with release at release-tip; fetch it first: git fetch origin release'])
})

test('a review of a pull request on Azure Repos says how to check it out with az, not with gh', async () => {
  const host = reviewHost({ azure: true, mcp: {}, pullRequest: { ...AZURE_PULL_REQUEST, head: { ref: 'discount', sha: 'root-9' } } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['stopped', 'pr-not-checked-out', 'the working copy is not on the head of pull request #12 (root-9); check it out first: az repos pr checkout --id 12'])
})

test('when the MCP server cannot serve, az reads the pull request and keeps the thread, and the journal says why az served', async () => {
  const failures = [
    ['mcp-unavailable', { servers: ['elsewhere'] }],
    ['mcp-failed', { fails: { repo_pull_request: 'mcp-failed' } }],
    ['mcp-tool-missing', { fails: { repo_pull_request_thread: 'mcp-tool-missing' } }],
    ['mcp-unreadable', { fails: { repo_pull_request_thread_write: 'unreadable' } }],
  ]
  for (const [fallback, mcp] of failures) {
    const host = reviewed({ mcp, forge: { unavailable: null } })

    const outcome = await host.review({ publish: true })

    assert.deepEqual([outcome.status, outcome.unpublished], ['NEEDS_REWORK', null], fallback)
    assert.deepEqual(routes(host), [['az', fallback]], fallback)
    assert.deepEqual(host.pullRequests.calls.filter((call) => call.startsWith('keep')), ['keep comment #12'], fallback)
    assert.equal(outcome.comment, 'https://dev.azure.com/acme/Shop%20Team/_git/payment/pull/12#issuecomment-901', fallback)
  }
})

test('a write the person or the host refuses posts nothing, is not asked of az, and the review says so', async () => {
  const host = reviewed({ mcp: { fails: { repo_pull_request_thread_write: 'mcp-refused' } }, forge: { unavailable: null } })

  const outcome = await host.review({ publish: true })

  const reason = 'the host refused the Azure DevOps MCP server\'s repo_pull_request_thread_write, so skraft wrote nothing on Azure Repos; allow it, or run again where it is allowed'
  assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['NEEDS_REWORK', null, `not published: ${reason}`])
  assert.deepEqual(commentEvents(host), [{ type: 'review.comment-skipped', pass: 1, via: 'mcp', fallback: undefined, reason: `not published: ${reason}` }])
  assert.deepEqual(host.pullRequests.calls.filter((call) => call.startsWith('keep')), [])
  assert.deepEqual(host.mcp.threads, [])
})

test('a pull request the server places in another organization is unreadable, so az reads it', async () => {
  const host = reviewed({ forge: { unavailable: null } })
  host.mcp.pullRequests[12] = azureJsonOf(AZURE_PULL_REQUEST, { organization: 'https://dev.azure.com/other' })

  const outcome = await host.review({ publish: true })

  assert.equal(outcome.status, 'NEEDS_REWORK')
  assert.deepEqual(routes(host), [['az', 'mcp-unreadable']])
  assert.deepEqual(host.pullRequests.calls, ['find #12', 'keep comment #12'])
})

test('a pull request of another repository or project than the remote\'s is refused and named, az asked nothing; the case of the names does not matter', async () => {
  const reason = 'pull request #12 is not in Shop Team/payment of the Git remote, so skraft does not review it'
  for (const where of [{ repository: 'billing' }, { project: 'Other Team' }]) {
    const host = reviewed({ forge: { unavailable: null } })
    host.mcp.pullRequests[12] = azureJsonOf(AZURE_PULL_REQUEST, where)

    const outcome = await host.review({ publish: true })

    assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['stopped', 'pr-unreadable', reason], JSON.stringify(where))
    assert.deepEqual(host.pullRequests.calls, [], JSON.stringify(where))
  }
  const cased = reviewed()
  cased.mcp.pullRequests[12] = azureJsonOf(AZURE_PULL_REQUEST, { repository: 'PAYMENT', project: 'shop team' })

  assert.equal((await cased.review({ publish: true })).status, 'NEEDS_REWORK')
})

const COMMENT = '### skraft review · #12 — NEEDS_REWORK (pass 1)\n\nNEEDS_REWORK: 1 reason to address\n\n<sub>skraft-review pr=12</sub>\n'
const ESCAPED = COMMENT.replace('<sub>', '&lt;sub&gt;').replace('</sub>', '&lt;/sub&gt;')
const QUOTING = `> ${COMMENT.split('\n').join('\n> ')}\nThis one is wrong.\n<sub>skraft-review pr=12</sub>\n`

/** The threads after a review kept its comment among the ones given, each as `[id, whether the review wrote its first comment]`. @param {Array<object>} seeded threads the pull request already has */
const afterReview = async (...seeded) => {
  const host = reviewed()
  host.mcp.threads.push(...seeded.map((thread, index) => ({ pullRequestId: 12, id: 5 + index, comments: [{ id: 1, content: COMMENT }], ...thread })))
  await host.review({ publish: true })
  return host.mcp.threads.map(({ id, comments }) => [id, comments[0].content.includes('To address:')])
}

test('the thread the review kept is found again by its marker as the server wrote it, escaped or not, and the latest of two is the one rewritten', async () => {
  assert.deepEqual(await afterReview({ comments: [{ id: 1, content: ESCAPED }] }), [[5, true]])
  assert.deepEqual(await afterReview({}), [[5, true]])
  assert.deepEqual(await afterReview({}, {}), [[5, false], [6, true]])
})

test('a reply that quotes the review, a thread a person deleted and a comment a person deleted are never rewritten: the review is posted again as a new thread', async () => {
  assert.deepEqual(await afterReview({ comments: [{ id: 1, content: QUOTING }] }), [[5, false], [41, true]])
  assert.deepEqual(await afterReview({ comments: [{ id: 1, content: COMMENT, isDeleted: true }] }), [[5, false], [41, true]])
  assert.deepEqual(await afterReview({ isDeleted: true }), [[5, false], [41, true]])
  assert.deepEqual(await afterReview({}, { comments: [{ id: 1, content: QUOTING }] }), [[5, true], [6, false]])
})

test('the thread at the URL the journal kept is rewritten, though a later thread holds the marker too', async () => {
  const host = reviewed()
  await host.review({ publish: true })
  host.mcp.threads.push({ pullRequestId: 12, id: 99, comments: [{ id: 1, content: COMMENT }] })
  host.git.commit('test: restore the discount check', [TEST_FILE])
  host.mcp.pullRequests[12] = azureJsonOf({ ...AZURE_PULL_REQUEST, head: { ref: 'discount', sha: 'root-2' } })

  const second = await host.review({ publish: true })

  assert.equal(second.comment, THREAD)
  assert.deepEqual(host.mcp.threads.map(({ id, comments }) => [id, comments[0].content.startsWith('### skraft review · #12 — APPROVED')]), [[41, true], [99, false]])
})

test('a hundred threads or more may be cut by the server: az lists them all and keeps the thread', async () => {
  const host = reviewed({ forge: { unavailable: null } })
  for (let id = 1; id <= 100; id += 1) host.mcp.threads.push({ pullRequestId: 12, id, comments: [{ id: 1, content: `thread ${id}` }] })

  await host.review({ publish: true })

  assert.deepEqual(routes(host), [['az', 'mcp-unreadable']])
  assert.equal(host.mcp.threads.length, 100)
})

test('an answer of the server that skraft cannot read, from any of its three tools, goes to az', async () => {
  const pull = azureJsonOf(AZURE_PULL_REQUEST)
  const unreadable = [
    { repo_pull_request: () => ({ ...pull, lastMergeSourceCommit: undefined }) },
    { repo_pull_request: () => ({ ...pull, lastMergeTargetCommit: {} }) },
    { repo_pull_request: () => ({ ...pull, sourceRefName: undefined }) },
    { repo_pull_request: () => ({ ...pull, targetRefName: 12 }) },
    { repo_pull_request: () => ({ ...pull, pullRequestId: 13 }) },
    { repo_pull_request: () => ({ ...pull, title: 12 }) },
    { repo_pull_request: () => ({ ...pull, description: 12 }) },
    { repo_pull_request: () => ({ ...pull, repository: { name: 'payment' } }) },
    { repo_pull_request: () => ({ ...pull, repository: { project: { name: 'Shop Team' } } }) },
    { repo_pull_request_thread: () => ({ not: 'a list' }) },
    { repo_pull_request_thread: () => [{ id: 'five', comments: [] }] },
    { repo_pull_request_thread: () => [{ id: 5, comments: [{ content: 'no id' }] }] },
    { repo_pull_request_thread_write: () => ({ id: 41 }) },
    { repo_pull_request_thread_write: () => ({ id: 'x', comments: [{ id: 1 }] }) },
  ]
  for (const answers of unreadable) {
    const host = reviewed({ mcp: { answers }, forge: { unavailable: null } })

    const outcome = await host.review({ publish: true })

    assert.deepEqual([outcome.status, routes(host)], ['NEEDS_REWORK', [['az', 'mcp-unreadable']]], String(Object.values(answers)[0]))
  }
  const rewritten = reviewed({ mcp: { answers: { repo_pull_request_thread_write: () => ({ id: 99 }) } }, forge: { unavailable: null } })
  rewritten.mcp.threads.push({ pullRequestId: 12, id: 5, comments: [{ id: 1, content: COMMENT }] })

  await rewritten.review({ publish: true })

  assert.deepEqual(routes(rewritten), [['az', 'mcp-unreadable']], 'a rewrite that does not answer the comment it was asked to rewrite')
})

test('a pull request without a description is reviewed, and no text of its author is kept for the lenses', async () => {
  const host = reviewed()
  host.mcp.pullRequests[12] = { ...azureJsonOf(AZURE_PULL_REQUEST), description: null }

  const outcome = await host.review()

  assert.equal(outcome.status, 'NEEDS_REWORK')
  assert.equal(await host.reviews.read('pr-12', 'pull-request.md'), null, 'nothing the author wrote is kept for the lenses')
})
