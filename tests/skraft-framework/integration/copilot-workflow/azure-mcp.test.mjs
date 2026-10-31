import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createSessionMcp } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/session-mcp.mjs'
import { register } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/register.mjs'
import { journalEvents, PLUGIN_ROOT, simulatedContext, workingCopy, writesNothing } from './simulated-host.mjs'
import { simulatedSdk } from './simulated-sdk.mjs'
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
