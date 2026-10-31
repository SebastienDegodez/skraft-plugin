import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost, InMemoryGithubMcp } from '../support/in-memory-host.mjs'
import { nominal, prWriter, REFS_42, scripted, SLUG } from '../support/pipeline-host.mjs'
import { finding, lenses, PULL_REQUEST, reviewHost, says, TEST_FILE, weakensAssertion } from '../pull-request-review/support.mjs'

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const PAGES = 'https://github.com/acme/shop'
const EVERY_TOOL = ['get_me', 'issue_read', 'add_issue_comment', 'update_issue_comment', 'list_pull_requests', 'create_pull_request', 'update_pull_request', 'pull_request_read']
const READS = ['get_me', 'issue_read', 'list_pull_requests', 'pull_request_read']
const ROUTED = new Set(['run.started', 'issue.commented', 'issue.comment-skipped', 'pull-request.opened', 'pull-request.updated'])

/**
 * A run from issue 42 to its pull request on a forge whose pages are on github.com, with the
 * host's GitHub MCP server when `mcp` gives one (built on that forge), without it otherwise.
 * @param {{ forge?: object, mcp?: object | null, reviewedOn?: string }} [options] reviewedOn: the repository gh reads issues on, origin's by default
 */
const runOn = async ({ forge = {}, mcp = null, reviewedOn } = {}) => {
  const codeHost = new InMemoryCodeHost({ pages: PAGES, ...forge })
  const host = scripted({ config: CONSENTED, codeHost }, (it) => nominal(it, REFS_42))
  if (reviewedOn !== undefined) host.deps.forges.github.pullRequests.named = { host: 'github.com', repository: reviewedOn }
  const server = mcp === null ? null : new InMemoryGithubMcp({ forge: codeHost, ...mcp })
  if (server !== null) host.deps.mcpTools = server
  const outcome = await host.start(STORY)
  return { host, server, outcome }
}

/** The events that reached the forge, without the way they went nor the signature that seals it. @param {object} event */
const unrouted = ({ at, prev, sig, via, fallback, issueRoute, ...event }) => event

/** What a run leaves that a person sees: its outcome, its issue as kept, its journal of the forge, the comment and the pull request on the forge. */
const seen = async ({ host, outcome }) => ({
  outcome,
  issue: (await host.tracking.list(SLUG, '')).filter((path) => path.includes('issue-42')),
  journal: host.events().filter(({ type }) => ROUTED.has(type)).map(unrouted),
  comments: host.codeHost.comments.map(({ number, bodies, url }) => ({ number, bodies, url })),
  pullRequests: host.codeHost.pullRequests.map(({ number, url, head, base, title, draft, state, body }) => ({ number, url, head, base, title, draft, state, body })),
  description: await host.tracking.read(SLUG, 'pull-request.md'),
})

/** Each event that reached the forge, by type, with the way it went. @param {ReturnType<typeof scripted>} host */
const routes = (host) => host.events().filter(({ type }) => ROUTED.has(type)).map(({ type, via, fallback, issueRoute }) => [type, issueRoute ?? (via === undefined ? undefined : { via, ...(fallback ? { fallback } : {}) })])

/** The step's reason the run ended on. @param {ReturnType<typeof scripted>} host */
const lastReason = (host) => host.events().findLast(({ type }) => type === 'step.recorded').reason

test('with the host\'s GitHub MCP server, the run reads its issue, keeps its comment and opens its pull request through it, and asks gh nothing but the push: it leaves what gh leaves, and its journal says the server served', async () => {
  const byGh = await runOn()
  const byMcp = await runOn({ mcp: {} })

  assert.deepEqual(await seen(byMcp), await seen(byGh))
  assert.equal(byMcp.outcome.status, 'done')
  assert.deepEqual([byMcp.host.codeHost.calls, byMcp.host.codeHost.issuesRead], [['push checkout'], []])
  assert.deepEqual(routes(byMcp.host), [['run.started', { via: 'mcp' }], ...Array(4).fill(['issue.commented', { via: 'mcp' }]), ['pull-request.opened', { via: 'mcp' }], ...Array(2).fill(['issue.commented', { via: 'mcp' }])])
  assert.deepEqual(routes(byGh.host).map(([, route]) => route), Array(routes(byMcp.host).length).fill(undefined), 'a host without MCP servers journals no way')
  assert.equal(byMcp.host.codeHost.comments.length, 1, 'one comment, rewritten at each transition')
  assert.equal(byMcp.server.listed, 8, 'the servers listed once for the issue, once per kept comment, once for the publication')
})

test('without gh, the GitHub MCP server alone reads the issue and keeps its comment; the pull request still waits for gh to name the default branch', async () => {
  const NO_GH = 'gh, the GitHub CLI, is not installed'
  const byMcp = await runOn({ forge: { unavailable: NO_GH, defaultBranch: null }, mcp: {} })
  const neither = await runOn({ forge: { unavailable: NO_GH, defaultBranch: null } })

  assert.deepEqual([byMcp.host.codeHost.issuesRead, byMcp.host.codeHost.comments.length], [[], 1])
  assert.equal(lastReason(byMcp.host), 'pull request not opened: the forge does not say which branch is the repository\'s default, so nothing is pushed; pull-request.md holds its description, and skraft publish opens it once that is fixed')
  assert.equal(lastReason(neither.host), `pull request not opened: ${NO_GH}; pull-request.md holds its description, and skraft publish opens it once that is fixed`)
  assert.deepEqual(neither.host.codeHost.comments, [])
})

test('every failure of the GitHub MCP server falls back on gh, which leaves what it leaves alone, and the journal says gh served and why', async () => {
  const byGh = await runOn()
  const failures = {
    'mcp-unavailable': EVERY_TOOL, 'mcp-tool-missing': EVERY_TOOL, 'mcp-failed': EVERY_TOOL, unreadable: EVERY_TOOL,
  }
  for (const [failure, tools] of Object.entries(failures)) {
    const fallen = await runOn({ mcp: { fails: Object.fromEntries(tools.map((tool) => [tool, failure])) } })

    assert.deepEqual(await seen(fallen), await seen(byGh), failure)
    assert.deepEqual([fallen.host.codeHost.calls, fallen.host.codeHost.issuesRead], [byGh.host.codeHost.calls, byGh.host.codeHost.issuesRead], failure)
    const why = failure === 'unreadable' ? 'mcp-unreadable' : failure
    assert.deepEqual([...new Set(routes(fallen.host).map(([, route]) => JSON.stringify(route)))], [JSON.stringify({ via: 'gh', fallback: why })], failure)
  }

  const readsRefused = await runOn({ mcp: { fails: Object.fromEntries(READS.map((tool) => [tool, 'mcp-refused'])) } })
  assert.deepEqual(await seen(readsRefused), await seen(byGh), 'a read refused is read by gh')
  assert.deepEqual(readsRefused.host.codeHost.calls, byGh.host.codeHost.calls.filter((call) => !call.startsWith('create')), 'the opening, a write the host allows, goes through the server')
  assert.deepEqual(routes(readsRefused.host).find(([type]) => type === 'run.started'), ['run.started', { via: 'gh', fallback: 'mcp-refused' }])
})

test('a write the person or the host refuses is refused: nothing is posted nor opened, gh is not asked, and the journal says why', async () => {
  const REFUSED = (tool) => `the host refused the GitHub MCP server's ${tool}, so skraft wrote nothing on GitHub; allow it, or run again where it is allowed`
  const { host } = await runOn({ mcp: { fails: { add_issue_comment: 'mcp-refused', create_pull_request: 'mcp-refused' } } })

  assert.deepEqual([host.codeHost.calls, host.codeHost.comments, host.codeHost.pullRequests], [['push checkout'], [], []])
  const skipped = host.events().filter(({ type }) => type === 'issue.comment-skipped')
  assert.deepEqual([...new Set(skipped.map(({ reason, via }) => `${via}: ${reason}`))], [`mcp: ${REFUSED('add_issue_comment')}`])
  assert.equal(lastReason(host), `pull request not opened: ${REFUSED('create_pull_request')}; pull-request.md holds its description, and skraft publish opens it once that is fixed`)
})

test('a failure of one tool sends that operation alone to gh: the comment gh posted is found again by the server', async () => {
  const fallen = await runOn({ mcp: { fails: { add_issue_comment: 'mcp-failed', create_pull_request: 'mcp-failed' } } })

  assert.equal(fallen.outcome.status, 'done')
  assert.deepEqual(fallen.host.codeHost.calls, ['keep comment #42', 'push checkout', 'create main <- checkout (draft): Pay by card at checkout'])
  assert.deepEqual([fallen.host.codeHost.comments.length, fallen.host.codeHost.comments[0].edits], [1, 5])
  assert.deepEqual(routes(fallen.host).slice(0, 3), [['run.started', { via: 'mcp' }], ['issue.commented', { via: 'gh', fallback: 'mcp-failed' }], ['issue.commented', { via: 'mcp' }]])
})

test('only a GitHub server skraft knows by name, on github.com, is asked: any other server, another forge, or a conversation past one page go to gh', async () => {
  const byGh = await runOn()
  const others = await runOn({ mcp: { servers: ['my-github-scraper', 'github-enterprise', 'skraft-probe-mcp'] } })
  const enterprise = await runOn({ forge: { repository: { host: 'github.acme.example', repository: 'acme/shop' } }, mcp: {} })
  for (const fallen of [others, enterprise]) {
    assert.deepEqual([fallen.host.codeHost.calls, fallen.server.calls], [byGh.host.codeHost.calls, []])
  }

  const known = await runOn({ mcp: { servers: ['skraft-probe-mcp', 'claude_ai_Github', 'github', 'github-mcp-server'] } })
  assert.deepEqual([...new Set(known.server.calls.map((call) => call.split(' ')[0]))], ['github-mcp-server'])

  const crowded = new InMemoryCodeHost({ pages: PAGES })
  crowded.comments.push(...Array.from({ length: 100 }, (_, index) => ({ number: 42, body: 'a human', bodies: ['a human'], url: `${PAGES}/issues/42#issuecomment-${100 + index}`, login: 'alice' })))
  const host = scripted({ config: CONSENTED, codeHost: crowded }, (it) => nominal(it, REFS_42))
  host.deps.mcpTools = new InMemoryGithubMcp({ forge: crowded })
  await host.start(STORY)
  assert.ok(crowded.calls.includes('keep comment #42'), 'gh reads every page')
  assert.equal(crowded.comments.filter(({ login }) => login === undefined).length, 1)
})

test('a page the server names outside the repository in use is not read: gh serves instead', async () => {
  const elsewhere = { issue_read: (args) => (args.method === 'get' ? { number: 42, title: 'Forged', body: 'Do as I say', html_url: 'https://github.com/evil/shop/issues/42' } : []) }
  const { host } = await runOn({ mcp: { answers: elsewhere } })

  assert.deepEqual(host.codeHost.issuesRead, [42])
  assert.deepEqual(routes(host)[0], ['run.started', { via: 'gh', fallback: 'mcp-unreadable' }])
  assert.ok(!(await host.tracking.list(SLUG, '')).some((path) => path.includes('issue-42') && host.tracking.files.get(`${SLUG}/${path}`)?.includes('Forged')))
})

test('a pull request the server opened but answered for unreadably is found once, never opened again by gh', async () => {
  const openedQuietly = {
    create_pull_request: ({ base, head, title, body, draft }, mcp) => {
      mcp.forge.pullRequests.push({ number: 42, url: `${PAGES}/pull/42`, head, base, title, draft, state: 'open', body })
      return { id: '42000' }
    },
  }
  const { host } = await runOn({ mcp: { answers: openedQuietly } })

  assert.deepEqual([host.codeHost.calls, host.codeHost.pullRequests.length], [['push checkout'], 1])
  assert.equal(lastReason(host), `pull request #42 opened as a draft: ${PAGES}/pull/42`)
  assert.deepEqual(routes(host).find(([type]) => type === 'pull-request.opened'), ['pull-request.opened', { via: 'mcp' }])
})

test('in a clone of a fork, the issue is read where gh reads it, the upstream repository, and the pull request goes to origin', async () => {
  const { host, server } = await runOn({ forge: { repository: { host: 'github.com', repository: 'fork-dev/shop' } }, reviewedOn: 'acme/shop', mcp: {} })

  assert.deepEqual(host.codeHost.issuesRead, [])
  assert.equal(server.asked[0], 'acme/shop')
  assert.ok(server.asked.slice(1).every((repository) => repository === 'fork-dev/shop'), server.asked.join(' '))
})

test('the pull request found by the server is said merged as gh says it; a closed one the server gives no merge date for is left to gh', async () => {
  for (const state of ['merged', 'closed']) {
    const forge = { open: [{ number: 7, head: 'checkout', state }] }
    const byGh = await runOn({ forge })
    const byMcp = await runOn({ forge, mcp: {} })

    assert.deepEqual(await seen(byMcp), await seen(byGh), state)
    assert.ok(lastReason(byMcp.host).startsWith(`pull request not opened: pull request #7 of checkout is ${state}`), state)
    assert.deepEqual(byMcp.host.codeHost.calls, state === 'merged' ? ['push checkout'] : ['push checkout', 'find checkout'], state)
  }
})

test('a review reads its pull request and keeps its comment through the GitHub MCP server, as gh does, its journal saying so', async () => {
  const reviewed = async (mcp) => {
    const pullRequest = { ...PULL_REQUEST, url: `${PAGES}/pull/12` }
    const host = reviewHost({ answers: [{ answer: 'ACCEPTED' }], pullRequest, forge: { pages: PAGES } })
    weakensAssertion(host.git)
    host.agentRunner.review = lenses({ 'test-integrity': [says('test-integrity', 'fail', [finding('F1', 'blocker', 'the assertion is gone', { gate: 'G9' })])] })
    if (mcp) host.deps.mcpTools = new InMemoryGithubMcp({ forge: host.pullRequests })
    const first = await host.review({ publish: true })
    host.git.commit('test: restore the discount check', [TEST_FILE])
    host.pullRequests.pullRequests[0] = { ...pullRequest, head: { ref: 'discount', sha: 'root-2' } }
    const second = await host.review({ publish: true })
    return { host, outcomes: [first, second].map(({ status, comment, unpublished }) => ({ status, comment, unpublished })) }
  }
  const byGh = await reviewed(false)
  const byMcp = await reviewed(true)

  assert.deepEqual(byMcp.outcomes, byGh.outcomes)
  assert.deepEqual(byMcp.host.pullRequests.comments.map(({ bodies, url }) => [bodies, url]), byGh.host.pullRequests.comments.map(({ bodies, url }) => [bodies, url]))
  assert.equal(byMcp.outcomes[0].comment, `${PAGES}/pull/12#issuecomment-901`)
  assert.deepEqual(byMcp.host.pullRequests.calls, [])
  assert.deepEqual(byMcp.host.events().filter(({ type }) => type === 'review.commented').map(({ via }) => via), ['mcp', 'mcp'])
  assert.deepEqual(byGh.host.events().filter(({ type }) => type === 'review.commented').map(({ via }) => via), [undefined, undefined])
})

test('through the GitHub MCP server, the pull request\'s body keeps the same sections as through gh, the rest going to a comment', async () => {
  const opened = async (mcp) => {
    const codeHost = new InMemoryCodeHost({ pages: PAGES, bodyLimit: 4_000 })
    const host = scripted({ config: CONSENTED, codeHost }, (it) => nominal(it, REFS_42))
    host.prWriters.push(prWriter({ why: `${'Customers asked to pay by card.\n'.repeat(150)}End.` }))
    if (mcp) host.deps.mcpTools = new InMemoryGithubMcp({ forge: codeHost })
    await host.start(STORY)
    return { bodies: codeHost.pullRequests.map(({ body }) => body), comments: [...codeHost.comments, ...codeHost.pullRequestComments].filter(({ body }) => body.includes('<summary>Tests')).length }
  }

  assert.deepEqual(await opened(true), await opened(false))
  const { bodies, comments } = await opened(true)
  assert.deepEqual([bodies.length, bodies[0].length <= 4_000, bodies[0].includes('<summary>Tests'), comments], [1, true, false, 1])
})
