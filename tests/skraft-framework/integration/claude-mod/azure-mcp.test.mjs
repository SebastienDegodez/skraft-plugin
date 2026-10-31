import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync, spawn } from 'node:child_process'
import { join } from 'node:path'
import { actsAs, scriptedModHost, stops } from './support/scripted-mod-host.mjs'
import { withoutAz } from '../support/without-az.mjs'
import { InMemoryAzureMcp } from '../../unit/support/in-memory-host.mjs'
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
 * The session's Azure DevOps MCP server as Claude Code 2.1.291 gives it to a mod: its tools
 * listed by `$.tool.list` as `mcp__ado__<tool>`, called by `$.mcp.call`, which `refuse` may reject.
 * @param {{ refuse?: string, name?: string }} [options]
 */
const azureServer = ({ refuse, name = 'ado' } = {}) => {
  const called = []
  return {
    called,
    tools: async () => [{ name: 'Bash' }, { name: `mcp__${name}__wit_work_item` }, { name: `mcp__${name}__wit_work_item_comment_write` }],
    call: async (server, tool, args) => {
      called.push(`${server} ${tool} ${args.action}`)
      if (refuse !== undefined) throw new Error(refuse)
      return { content: [{ type: 'text', text: JSON.stringify(WORK_ITEM) }], isError: false }
    },
  }
}

/** The mod on a working copy whose origin is an Azure Repos repository, `$.mcp` the server. @param {import('node:test').TestContext} t @param {object} [options] */
const modOnAzure = async (t, options) => {
  const mod = await scriptedModHost({ behaviours: [stops()], forge: t })
  t.after(() => mod.cleanup())
  await withoutAz(t)
  execFileSync('git', ['remote', 'set-url', 'origin', REMOTE], { cwd: mod.root })
  const server = azureServer(options)
  mod.host.mcp = server
  return { mod, server }
}

test('the tool starts a run from work item 42 and reads it through the session\'s Azure DevOps MCP server, its HTML kept as Markdown for the agents, the journal saying the server read it', async (t) => {
  const { mod, server } = await modOnAzure(t)

  await mod.tool({ slug: 'refund', issue: 42, title: 'Refund a card payment' })
  await mod.settled()

  assert.deepEqual(server.called, ['ado wit_work_item get'])
  const [started] = await mod.journal('refund')
  assert.deepEqual(started.issueRoute, { via: 'mcp' })
  const kept = await readFile(join(mod.root, '.copilot-tracking', 'skraft-plans', 'refund', ...started.artifacts[0].split('/')), 'utf8')
  assert.equal(kept, '# Issue #42: Pay by card\n\nhttps://dev.azure.com/acme/Shop%20Team/_workitems/edit/42\n\nAs a shopper, I **pay by card**.\n\n## Acceptance criteria\n\n- Paying 10 answers paid 10\n')
})

/** `$.process.run` on a PATH without az. @param {NodeJS.ProcessEnv} env */
const runOn = (env) => ([program, ...args], init = {}) => new Promise((resolve, reject) => {
  const child = spawn(program, args, { cwd: init.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.once('error', reject)
  child.once('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
})

/** `/skraft review 12 --publish` on an Azure Repos working copy, the session's `ado` server the in-memory one. @param {import('node:test').TestContext} t @param {object} [options] */
const reviewedOnAzure = async (t, options = {}) => {
  const repo = pullRequestRepository(t)
  execFileSync('git', ['remote', 'set-url', 'origin', AZURE_REMOTE], { cwd: repo.cwd })
  await withoutAz(t)
  const mod = await scriptedModHost({ cwd: repo.cwd, otherwise: actsAs(reviewLlm()) })
  t.after(() => mod.cleanup())
  const own = mod.host.run
  const onPath = runOn({ ...process.env })
  mod.host.run = (argv, init) => (argv[0] === 'node' ? own(argv, init) : onPath(argv, init))
  const server = new InMemoryAzureMcp({ pullRequests: { 12: azurePullRequestOf(repo) }, ...options })
  mod.host.mcp = {
    tools: async () => [{ name: 'mcp__ado__repo_pull_request' }, { name: 'mcp__ado__repo_pull_request_thread' }, { name: 'mcp__ado__repo_pull_request_thread_write' }],
    call: async (name, tool, args) => {
      const called = await server.call({ server: name, tool, arguments: args })
      if (!called.ok && called.reason === 'mcp-refused') throw new Error('refused: Claude requested permissions to use mcp__ado__repo_pull_request_thread_write, but you haven\'t granted it yet.')
      return called.ok ? { content: [{ type: 'text', text: called.text }], isError: false } : { content: [], isError: true }
    },
  }
  await mod.command('review 12 --publish')
  return { repo, mod, server, outcome: await mod.settled() }
}

test('/skraft review reads an Azure Repos pull request and keeps its thread through the session\'s Azure DevOps MCP server, journaled mcp, az not asked', async (t) => {
  const { repo, server, outcome } = await reviewedOnAzure(t)

  assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['NEEDS_REWORK', THREAD_URL, null])
  assert.deepEqual(server.calls, ['ado repo_pull_request', 'ado repo_pull_request', 'ado repo_pull_request_thread', 'ado repo_pull_request_thread_write'])
  const journal = (await readFile(join(repo.cwd, '.copilot-tracking', 'skraft-reviews', 'pr-12', 'events.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
  assert.deepEqual(journal.filter(({ type }) => type === 'review.commented').map(({ via, fallback }) => [via, fallback]), [['mcp', undefined]])
})

test('/skraft review whose write the host refuses posts nothing on Azure Repos, and says so', async (t) => {
  const { server, outcome } = await reviewedOnAzure(t, { fails: { repo_pull_request_thread_write: 'mcp-refused' } })

  assert.equal(outcome.comment, null)
  assert.match(outcome.unpublished, /^not published: the host refused the Azure DevOps MCP server's repo_pull_request_thread_write/)
  assert.deepEqual(server.threads, [])
})

test('a server not named ado is never asked: the tool lists it, the run does not call it', async (t) => {
  const { mod, server } = await modOnAzure(t, { name: 'ado-remote-mcp' })

  await mod.tool({ slug: 'refund', issue: 42, title: 'Refund a card payment' })
  await mod.settled()

  assert.deepEqual(server.called, [])
})
