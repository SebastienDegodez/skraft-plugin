import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost, InMemoryGithubMcp } from '../support/in-memory-host.mjs'
import { nominal, REFS_42, scripted, SLUG } from '../support/pipeline-host.mjs'
import { finding, lenses, PULL_REQUEST, reviewHost, says, TEST_FILE, weakensAssertion } from '../pull-request-review/support.mjs'

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const FAILURES = ['mcp-unavailable', 'mcp-refused', 'mcp-tool-missing', 'mcp-failed', 'unreadable']
const EVERY_TOOL = ['get_me', 'issue_read', 'add_issue_comment', 'update_issue_comment', 'list_pull_requests', 'create_pull_request', 'update_pull_request', 'pull_request_read', 'search_repositories']

/**
 * A run from issue 42 to its pull request on a forge, with the host's GitHub MCP server when
 * `mcp` gives one (built on that forge), without it otherwise.
 * @param {{ forge?: object, mcp?: object | null }} [options]
 */
const runOn = async ({ forge = {}, mcp = null } = {}) => {
  const codeHost = new InMemoryCodeHost(forge)
  const host = scripted({ config: CONSENTED, codeHost }, (it) => nominal(it, REFS_42))
  const server = mcp === null ? null : new InMemoryGithubMcp({ forge: codeHost, ...mcp })
  if (server !== null) host.deps.mcpTools = server
  const outcome = await host.start(STORY)
  return { host, server, outcome }
}

/** What a run leaves that a person sees: its outcome, its issue as kept, its journal of the forge, the comment and the pull request on the forge. */
const seen = async ({ host, outcome }) => ({
  outcome,
  issue: (await host.tracking.list(SLUG, '')).filter((path) => path.includes('issue-42')),
  journal: host.events().filter(({ type }) => type.startsWith('issue.') || type.startsWith('pull-request.') || type === 'run.initialised').map(({ at, ...event }) => event),
  comments: host.codeHost.comments.map(({ number, bodies, url }) => ({ number, bodies, url })),
  pullRequests: host.codeHost.pullRequests.map(({ number, url, head, base, title, draft, state, body }) => ({ number, url, head, base, title, draft, state, body })),
  description: await host.tracking.read(SLUG, 'pull-request.md'),
})

test('with the host\'s GitHub MCP server, the run reads its issue, keeps its comment and opens its pull request through it, and asks gh nothing but the push: what it leaves is what gh leaves', async () => {
  const byGh = await runOn()
  const byMcp = await runOn({ mcp: {} })

  assert.deepEqual(await seen(byMcp), await seen(byGh))
  assert.equal(byMcp.outcome.status, 'done')
  assert.deepEqual([byMcp.host.codeHost.calls, byMcp.host.codeHost.issuesRead], [['push checkout'], []])
  assert.deepEqual([...new Set(byMcp.server.calls)], [
    'github-mcp-server issue_read', 'github-mcp-server get_me', 'github-mcp-server add_issue_comment', 'github-mcp-server update_issue_comment',
    'github-mcp-server search_repositories', 'github-mcp-server list_pull_requests', 'github-mcp-server create_pull_request',
  ])
  assert.equal(byMcp.host.codeHost.comments.length, 1, 'one comment, rewritten at each transition')
})

test('without gh, the GitHub MCP server alone reads the issue and opens the pull request; without either, nothing is opened and gh\'s reason is said', async () => {
  const NO_GH = 'gh, the GitHub CLI, is not installed'
  const byMcp = await runOn({ forge: { unavailable: NO_GH }, mcp: {} })
  const neither = await runOn({ forge: { unavailable: NO_GH } })

  assert.equal(byMcp.host.events().findLast(({ type }) => type === 'step.recorded').reason, 'pull request #42 opened as a draft: https://github.example.com/acme/shop/pull/42')
  assert.deepEqual(byMcp.host.codeHost.pullRequests.map(({ number, state, draft }) => [number, state, draft]), [[42, 'open', true]])
  assert.equal(neither.host.events().findLast(({ type }) => type === 'step.recorded').reason, `pull request not opened: ${NO_GH}; pull-request.md holds its description, and skraft publish opens it once that is fixed`)
  assert.deepEqual(neither.host.codeHost.pullRequests, [])
})

test('every failure of the GitHub MCP server, on any tool, falls back on gh, which leaves what it leaves alone', async () => {
  const byGh = await runOn()
  for (const failure of FAILURES) {
    const fallen = await runOn({ mcp: { fails: Object.fromEntries(EVERY_TOOL.map((tool) => [tool, failure])) } })

    assert.deepEqual(await seen(fallen), await seen(byGh), failure)
    assert.deepEqual([fallen.host.codeHost.calls, fallen.host.codeHost.issuesRead], [byGh.host.codeHost.calls, byGh.host.codeHost.issuesRead], failure)
  }
})

test('a failure of one tool sends that operation alone to gh: the comment kept by gh is found again by the server', async () => {
  const fallen = await runOn({ mcp: { fails: { add_issue_comment: 'mcp-refused', create_pull_request: 'mcp-failed' } } })

  assert.equal(fallen.outcome.status, 'done')
  assert.deepEqual(fallen.host.codeHost.calls, ['keep comment #42', 'push checkout', 'create main <- checkout (draft): Pay by card at checkout'])
  assert.equal(fallen.host.codeHost.comments.length, 1)
  assert.equal(fallen.host.codeHost.comments[0].edits, 5, 'rewritten by the server at each later transition')
})

test('a host whose MCP servers have no GitHub one, a remote off github.com, or comments the server lists past one page, go to gh', async () => {
  const byGh = await runOn()
  const others = await runOn({ mcp: { servers: ['skraft-probe-mcp'] } })
  const enterprise = await runOn({ forge: { repository: { host: 'github.acme.example', repository: 'acme/shop' } }, mcp: {} })

  for (const fallen of [others, enterprise]) {
    assert.deepEqual(fallen.host.codeHost.calls, byGh.host.codeHost.calls)
    assert.deepEqual(fallen.server.calls, [])
  }
  const crowded = new InMemoryCodeHost()
  crowded.comments.push(...Array.from({ length: 100 }, (_, index) => ({ number: 42, body: 'a human', bodies: ['a human'], url: `https://github.example.com/acme/shop/issues/42#issuecomment-${100 + index}`, login: 'alice' })))
  const host = scripted({ config: CONSENTED, codeHost: crowded }, (it) => nominal(it, REFS_42))
  host.deps.mcpTools = new InMemoryGithubMcp({ forge: crowded })
  await host.start(STORY)
  assert.ok(crowded.calls.includes('keep comment #42'), 'gh reads every page')
  assert.equal(crowded.comments.filter(({ login }) => login === undefined).length, 1)
})

test('the pull request found by the server is said merged as gh says it, and no other is opened', async () => {
  const forge = { open: [{ number: 7, head: 'checkout', state: 'merged' }] }
  const byGh = await runOn({ forge })
  const byMcp = await runOn({ forge, mcp: {} })

  assert.deepEqual(await seen(byMcp), await seen(byGh))
  assert.equal(byMcp.host.events().findLast(({ type }) => type === 'step.recorded').reason.startsWith('pull request not opened: pull request #7 of checkout is merged'), true)
  assert.deepEqual(byMcp.host.codeHost.calls, ['push checkout'])
})

test('a review reads its pull request and keeps its comment through the GitHub MCP server, as gh does', async () => {
  const reviewed = async (mcp) => {
    const host = reviewHost({ answers: [{ answer: 'ACCEPTED' }] })
    weakensAssertion(host.git)
    host.agentRunner.review = lenses({ 'test-integrity': [says('test-integrity', 'fail', [finding('F1', 'blocker', 'the assertion is gone', { gate: 'G9' })])] })
    if (mcp) host.deps.mcpTools = new InMemoryGithubMcp({ forge: host.pullRequests })
    const first = await host.review({ publish: true })
    host.git.commit('test: restore the discount check', [TEST_FILE])
    host.pullRequests.pullRequests[0] = { ...PULL_REQUEST, head: { ref: 'discount', sha: 'root-2' } }
    const second = await host.review({ publish: true })
    return { host, outcomes: [first, second].map(({ status, comment, unpublished }) => ({ status, comment, unpublished })) }
  }
  const byGh = await reviewed(false)
  const byMcp = await reviewed(true)

  assert.deepEqual(byMcp.outcomes, byGh.outcomes)
  assert.deepEqual(byMcp.host.pullRequests.comments.map(({ bodies, url }) => [bodies, url]), byGh.host.pullRequests.comments.map(({ bodies, url }) => [bodies, url]))
  assert.equal(byMcp.outcomes[0].comment, `${PULL_REQUEST.url}#issuecomment-901`)
  assert.deepEqual(byMcp.host.pullRequests.calls, [])
})
