import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAzureMcp, InMemoryCodeHost, InMemoryGit } from '../support/in-memory-host.mjs'
import { nominal, prWriter, REFS_42, scripted, SLUG } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

const REMOTE = 'https://dev.azure.com/acme/Shop%20Team/_git/payment'
const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } }, forge: 'azure-devops' }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const LONG_WHY = `${'Customers asked to pay by card.\n'.repeat(60)}End.`
const WRITE = 'repo_pull_request_thread_write'
const USER_STORY = Object.freeze({ 'System.WorkItemType': 'User Story', 'System.TeamProject': 'Shop Team', 'System.Title': 'Pay by card', 'System.Description': '<p>Pay.</p>' })

/**
 * A run on the Azure Repos repository of the project Shop Team that ends by opening its pull
 * request, whose description is too long for the 4,000 characters Azure takes; the az double
 * stands for az, the host's MCP server for `ado`, none when `mcp` is null.
 * @param {{ mcp?: object | null, az?: object }} [options] mcp: the server's options; az: the az double's
 */
const run = async ({ mcp = {}, az = {} } = {}) => {
  const codeHost = new InMemoryCodeHost({ pages: 'https://dev.azure.com/acme', link: (issue, closes) => `${closes ? 'Fixes ' : ''}#${issue}`, bodyLimit: 4_000, commentLimit: 140_000, takesRequestFile: true, repository: null, ...az })
  const host = scripted({ config: CONSENTED, forge: 'azure-devops', codeHost, git: new InMemoryGit({ remote: REMOTE }) }, (it) => nominal(it, REFS_42))
  host.prWriters.push(prWriter({ why: LONG_WHY }))
  const server = mcp === null ? null : new InMemoryAzureMcp({ workItems: { 42: USER_STORY }, ...mcp })
  if (server !== null) host.deps.mcpTools = server
  const outcome = await host.start(STORY)
  assert.equal(outcome.status, 'done', outcome.reason)
  return { host, server, codeHost }
}

const writes = (server) => server.requests.filter(({ tool }) => tool === WRITE).map(({ arguments: args }) => args)
const kept = (host) => eventsOf(host, 'pull-request.details-kept')
const azKept = (codeHost) => codeHost.calls.filter((call) => call.startsWith('keep pr comment'))

test('served by the host\'s Azure DevOps MCP server, the run details are posted as a closed thread of the pull request, then rewritten in place by their thread and comment', async () => {
  const { host, server, codeHost } = await run()

  const [created] = writes(server)
  assert.deepEqual([created.action, created.repositoryId, created.project, created.pullRequestId, created.status], ['create', 'payment', 'Shop Team', 42, 'Closed'])
  assert.ok(created.content.startsWith(`<!-- skraft:run-details slug=${SLUG} part=1 -->\n# skraft · run details\n\n`), created.content.slice(0, 100))
  assert.deepEqual(server.threads.map(({ id, status, pullRequestId }) => [id, status, pullRequestId]), [[41, 'Closed', 42]])
  const url = 'https://dev.azure.com/acme/Shop%20Team/_apis/git/repositories/payment/pullRequests/42/threads/41/comments/1'
  assert.deepEqual(kept(host).map(({ part, parts, url: where, via, fallback }) => ({ part, parts, url: where, via, fallback })), [{ part: 1, parts: 1, url, via: 'mcp', fallback: undefined }])
  assert.deepEqual(server.requests.filter(({ tool }) => tool.startsWith('repo_')).slice(0, 2).map(({ tool, arguments: args }) => [tool, args.action, args.repositoryNameOrId ?? args.repositoryId]), [['repo_repository', 'get', 'payment'], ['repo_pull_request_thread', 'list', 'payment']])

  await host.publish()

  const rewritten = writes(server).at(-1)
  assert.deepEqual({ action: rewritten.action, threadId: rewritten.threadId, commentId: rewritten.commentId, fullResponse: rewritten.fullResponse, pullRequestId: rewritten.pullRequestId }, { action: 'update', threadId: 41, commentId: 1, fullResponse: true, pullRequestId: 42 })
  assert.equal(server.threads.length, 1)
  assert.deepEqual([azKept(codeHost), kept(host).at(-1).via], [[], 'mcp'])
})

test('a rewrite the server answers for another comment than the one rewritten is unreadable: az keeps the details and the run says why, never a URL nobody confirmed', async () => {
  const { host, server, codeHost } = await run()
  server.answers[WRITE] = () => ({ id: 99, content: 'another comment' })
  await host.tracking.write(SLUG, `details/2026-10-11/test-plan-${SLUG}.md`, 'A sharper test plan.')

  await host.publish()

  assert.deepEqual(kept(host).at(-1).fallback, 'mcp-unreadable')
  assert.equal(azKept(codeHost).length, 1)
})

test('a thread whose address the journal no longer holds is found again by the marker its first comment starts with', async () => {
  const { host, server } = await run()
  server.threads[0].id = 777

  await host.publish()

  assert.equal(server.threads.length, 1)
  assert.deepEqual(writes(server).at(-1), { ...writes(server).at(-1), action: 'update', threadId: 777, commentId: 1 })
})

test('with no server, a server without the tool, an unreadable answer, another organization or more threads than the pages followed, az keeps the details and the run says why', async () => {
  const cases = [
    ['mcp-unavailable', { mcp: { servers: [] } }],
    ['mcp-tool-missing', { mcp: { fails: { repo_pull_request_thread: 'mcp-tool-missing' } } }],
    ['mcp-failed', { mcp: { fails: { repo_repository: 'mcp-failed' } } }],
    ['mcp-unreadable', { mcp: { fails: { repo_pull_request_thread: 'unreadable' } } }],
    ['mcp-unreadable', { mcp: { answers: { repo_repository: () => ({ url: 'https://dev.azure.com/other/p-1/_apis/git/repositories/r-1' }) } } }],
    ['mcp-unreadable', { mcp: { answers: { repo_pull_request_thread: () => Array.from({ length: 100 }, (_, id) => ({ id: id + 1, comments: [{ id: 1, content: 'a person' }] })) } } }],
  ]
  for (const [fallback, options] of cases) {
    const { host, server, codeHost } = await run(options)

    assert.equal(azKept(codeHost).length, 1, fallback)
    assert.deepEqual(kept(host).map(({ via, fallback: why }) => [via, why]), [['az', fallback]], fallback)
    assert.deepEqual(writes(server), [], fallback)
  }
})

test('a write the host refuses is refused: nothing is retried with az, the reason is the fixed one, and the run goes on with its details journaled skipped', async () => {
  const { host, codeHost } = await run({ mcp: { fails: { [WRITE]: 'mcp-refused' } } })

  const reason = 'the host refused the Azure DevOps MCP server\'s repo_pull_request_thread_write, so skraft wrote nothing on Azure Repos; allow it, or run again where it is allowed'
  assert.deepEqual(azKept(codeHost), [])
  assert.deepEqual(eventsOf(host, 'pull-request.details-skipped').map(({ part, reason: why, via }) => ({ part, reason: why, via })), [{ part: 1, reason, via: 'mcp' }])
  assert.equal(eventsOf(host, 'step.recorded').at(-1).reason, `pull request #42 opened as a draft: https://dev.azure.com/acme/pull/42; its run details were not kept: ${reason}; pull-request.md holds them, and skraft publish keeps them once that is fixed`)
})

test('a read the host refuses is refused too, the server\'s repository or the listing of the threads: az is not asked to read instead, nothing is written, and the details are journaled skipped with the fixed reason', async () => {
  for (const tool of ['repo_repository', 'repo_pull_request_thread']) {
    const { host, server, codeHost } = await run({ mcp: { fails: { [tool]: 'mcp-refused' } } })

    const reason = `the host refused the Azure DevOps MCP server's ${tool}, so skraft read nothing from Azure Repos and did not ask az instead; allow it, or run again where it is allowed`
    assert.deepEqual([azKept(codeHost), writes(server)], [[], []], tool)
    assert.deepEqual(eventsOf(host, 'pull-request.details-skipped').map(({ part, reason: why, via }) => ({ part, reason: why, via })), [{ part: 1, reason, via: 'mcp' }], tool)
    assert.equal(eventsOf(host, 'step.recorded').at(-1).reason, `pull request #42 opened as a draft: https://dev.azure.com/acme/pull/42; its run details were not kept: ${reason}; pull-request.md holds them, and skraft publish keeps them once that is fixed`, tool)
  }
})

test('without any MCP server in the host, az keeps the details and no route is journaled', async () => {
  const { host, codeHost } = await run({ mcp: null })

  assert.equal(azKept(codeHost).length, 1)
  assert.deepEqual(kept(host).map(({ via, fallback }) => [via, fallback]), [[undefined, undefined]])
})
