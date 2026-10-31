import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { scriptedModHost, stops } from './support/scripted-mod-host.mjs'
import { withoutAz } from '../support/without-az.mjs'

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

test('a server not named ado is never asked: the tool lists it, the run does not call it', async (t) => {
  const { mod, server } = await modOnAzure(t, { name: 'ado-remote-mcp' })

  await mod.tool({ slug: 'refund', issue: 42, title: 'Refund a card payment' })
  await mod.settled()

  assert.deepEqual(server.called, [])
})
