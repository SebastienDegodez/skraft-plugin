import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createSessionMcp } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/session-mcp.mjs'
import { register } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/register.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftReviewWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-review-workflow.mjs'
import { createHostConfirmation } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/host-confirmation.mjs'
import { InMemoryAzureMcp } from '../../unit/support/in-memory-host.mjs'
import { actsAs, confirmingSession, journalEvents, PLUGIN_ROOT, simulatedContext, workingCopy, writesNothing } from './simulated-host.mjs'
import { simulatedSdk } from './simulated-sdk.mjs'
import { withoutAz } from '../support/without-az.mjs'
import { pullRequestRepository, reviewLlm } from '../support/pull-request-repository.mjs'
import { AZURE_REMOTE, azurePullRequestOf, THREAD_URL } from '../support/azure-pull-request.mjs'

const REMOTE = 'https://dev.azure.com/acme/Shop%20Team/_git/payment'
const WORK_ITEM = {
  id: 42,
  url: 'https://dev.azure.com/acme/_apis/wit/workItems/42',
  fields: {
    'System.WorkItemType': 'User Story',
    'System.TeamProject': 'Shop Team',
    'System.Title': 'Pay by card',
    'System.Description': '<p>As a shopper, I <strong>pay by card</strong>.</p>',
    'Microsoft.VSTS.Common.AcceptanceCriteria': '<ul><li>Paying 10 answers paid 10</li></ul>',
  },
}

/**
 * A joined session whose MCP servers are `servers` (name and status), its tools run by
 * `rpc.tools.execute` as `<server>-<tool>`, as Copilot CLI 1.0.102-1 gives them to the extension;
 * `executed` keeps each tool name called.
 * @param {string} cwd @param {Array<{ name: string, status: string }>} servers
 */
const sessionOn = (cwd, servers) => {
  const executed = []
  const execute = async ({ name }) => {
    executed.push(name)
    return { resultType: 'success', textResultForLlm: JSON.stringify(WORK_ITEM) }
  }
  return { executed, session: { rpc: { metadata: { snapshot: async () => ({ workingDirectory: cwd }) }, mcp: { list: async () => ({ servers }) }, tools: { execute } } } }
}

/** A working copy whose origin is an Azure Repos repository, on a PATH without az. @param {import('node:test').TestContext} t */
const onAzure = async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  await withoutAz(t)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd })
  execFileSync('git', ['-c', 'user.name=skraft', '-c', 'user.email=skraft@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd })
  execFileSync('git', ['remote', 'add', 'origin', REMOTE], { cwd })
  return cwd
}

/** The registered workflow, started from work item 42 in a working copy with that session. */
const started = async (cwd, session) => {
  const sdk = simulatedSdk({ session })
  await register({ defineWorkflow: sdk.defineWorkflow, joinSession: sdk.joinSession, createCanvas: sdk.createCanvas, CanvasError: sdk.CanvasError, pluginRoot: PLUGIN_ROOT, home: `${cwd}-home` })
  const [workflow] = sdk.joins[0].workflows
  const { ctx } = simulatedContext({ args: { slug: 'checkout', issue: 42, title: 'Pay by card' }, behaviours: [writesNothing] })
  await workflow.run(ctx)
  return (await journalEvents(cwd, 'checkout')).find(({ type }) => type === 'run.started')
}

test('the registered pipeline workflow reads the story\'s work item through the joined session\'s Azure DevOps MCP server, and journals that it did', async (t) => {
  const cwd = await onAzure(t)
  const { executed, session } = sessionOn(cwd, [{ name: 'ado', status: 'connected' }])

  const run = await started(cwd, session)

  assert.deepEqual(executed, ['ado-wit_work_item'])
  assert.deepEqual([run.issueRoute, run.artifacts.some((path) => path.includes('issue-42'))], [{ via: 'mcp' }, true])
})

for (const [name, servers] of Object.entries({
  'is not named ado': [{ name: 'ado-remote-mcp', status: 'connected' }],
  'is not connected': [{ name: 'ado', status: 'failed' }],
})) {
  test(`a session whose Azure DevOps server ${name} is not asked for the work item`, async (t) => {
    const cwd = await onAzure(t)
    const { executed, session } = sessionOn(cwd, servers)

    const run = await started(cwd, session)

    assert.deepEqual(executed, [])
    assert.equal(run.issueRoute?.fallback, 'mcp-unavailable')
  })
}

test('the session\'s tool of the Azure DevOps server is run as <server>-<tool>', async () => {
  const { executed, session } = sessionOn('/work', [{ name: 'ado', status: 'connected' }])
  const mcp = createSessionMcp({ session: () => session })

  assert.deepEqual(await mcp.servers(), ['ado'])
  assert.equal((await mcp.call({ server: 'ado', tool: 'wit_work_item_comment_write', arguments: { action: 'add' } })).ok, true)
  assert.deepEqual(executed, ['ado-wit_work_item_comment_write'])
})

/** The joined session whose `ado` server is the in-memory one, its tools run as `<server>-<tool>`. @param {InMemoryAzureMcp} server */
const sessionOfServer = (server) => Object.assign(confirmingSession(), {
  rpc: {
    mode: { get: async () => 'interactive' },
    mcp: { list: async () => ({ servers: [{ name: 'ado', status: 'connected' }] }) },
    tools: {
      execute: async ({ name, arguments: args }) => {
        const called = await server.call({ server: 'ado', tool: name.slice('ado-'.length), arguments: args })
        return called.ok ? { resultType: 'success', textResultForLlm: called.text } : { resultType: called.reason === 'mcp-refused' ? 'rejected' : 'failure' }
      },
    },
  },
})

/** The review of pull request 12 with --publish, on an Azure Repos working copy and a PATH without az, the host's session serving `ado` from `server`. @param {import('node:test').TestContext} t @param {object} [options] */
const reviewedOnAzure = async (t, options = {}) => {
  const repo = pullRequestRepository(t)
  execFileSync('git', ['remote', 'set-url', 'origin', AZURE_REMOTE], { cwd: repo.cwd })
  await withoutAz(t)
  const server = new InMemoryAzureMcp({ pullRequests: { 12: azurePullRequestOf(repo) }, ...options })
  const session = sessionOfServer(server)
  const host = { cwd: repo.cwd, pluginRoot: PLUGIN_ROOT, home: `${repo.cwd}-home`, confirmation: createHostConfirmation({ session: () => session }), mcp: createSessionMcp({ session: () => session }) }
  const { ctx } = simulatedContext({ args: { pr: 12, publish: true }, otherwise: actsAs(reviewLlm()) })
  const outcome = await runSkraftReviewWorkflow(ctx, host)
  return { repo, server, outcome }
}

test('the registered review workflow reads an Azure Repos pull request and keeps its thread through the joined session\'s Azure DevOps MCP server, journaled mcp, az not asked', async (t) => {
  const { repo, server, outcome } = await reviewedOnAzure(t)

  assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['NEEDS_REWORK', THREAD_URL, null])
  assert.deepEqual(server.calls, ['ado repo_pull_request', 'ado repo_pull_request', 'ado repo_pull_request_thread', 'ado repo_pull_request_thread_write'])
  assert.equal(server.threads.length, 1)
  const journal = readFileSync(join(repo.cwd, '.copilot-tracking', 'skraft-reviews', 'pr-12', 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  assert.deepEqual(journal.filter(({ type }) => type === 'review.commented').map(({ via, fallback }) => [via, fallback]), [['mcp', undefined]])
})

test('a refusal of the host to run the Azure DevOps server\'s write posts nothing, and the review says so', async (t) => {
  const { server, outcome } = await reviewedOnAzure(t, { fails: { repo_pull_request_thread_write: 'mcp-refused' } })

  assert.equal(outcome.comment, null)
  assert.match(outcome.unpublished, /^not published: the host refused the Azure DevOps MCP server's repo_pull_request_thread_write/)
  assert.deepEqual(server.threads, [])
})
