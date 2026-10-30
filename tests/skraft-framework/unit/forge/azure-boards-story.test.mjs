import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAzureMcp, InMemoryCodeHost, InMemoryGit } from '../support/in-memory-host.mjs'
import { pipelineHost, SLUG } from '../support/pipeline-host.mjs'

const REMOTE = 'https://dev.azure.com/acme/Shop%20Team/_git/payment'
const NO_AZ = 'az, the Azure CLI, is not installed'
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const DAY = '2026-10-11'
const ISSUE_42 = `plans/${DAY}/issue-42.md`

/** A story of the project Shop Team, as Azure Boards keeps it: the fields an HTML work item holds. */
const USER_STORY = Object.freeze({
  'System.WorkItemType': 'User Story',
  'System.TeamProject': 'Shop Team',
  'System.Title': 'Pay by card',
  'System.Description': '<p>As a shopper, I <strong>pay by card</strong> at checkout.</p><p>The card is charged once.</p>',
  'Microsoft.VSTS.Common.AcceptanceCriteria': '<ul><li>A declined card shows an error</li><li>An accepted card creates the order</li></ul>',
})

/**
 * A new run from work item 42 on a working copy whose remote is the Azure Repos repository of the
 * project Shop Team; the az double stands for az, the host's MCP server for `ado`.
 * @param {{ az?: object, mcp?: object | null }} [options] az: what the az double is told; mcp: the server's options, none without a server
 */
const startOn = async ({ az = { unavailable: NO_AZ }, mcp = {} } = {}) => {
  const codeHost = new InMemoryCodeHost({ pages: 'https://dev.azure.com/acme', link: (number) => `AB#${number}`, bodyLimit: 4_000, takesRequestFile: true, repository: null, ...az })
  const host = pipelineHost({ forge: 'azure-devops', codeHost, git: new InMemoryGit({ remote: REMOTE }) })
  const server = mcp === null ? null : new InMemoryAzureMcp({ workItems: { 42: USER_STORY }, ...mcp })
  if (server !== null) host.deps.mcpTools = server
  const outcome = await host.init(STORY)
  return { host, server, outcome }
}

/** The run.started event of the host. @param {Awaited<ReturnType<typeof startOn>>['host']} host */
const started = (host) => host.events().find(({ type }) => type === 'run.started')

test('with the host\'s Azure DevOps MCP server, a run from work item 42 keeps it for its agents: title, page, description and acceptance criteria in Markdown, and journals that the server read it', async () => {
  const { host, server, outcome } = await startOn()

  assert.equal(outcome.reason, `${SLUG} is the active pipeline`)
  assert.equal(await host.tracking.read(SLUG, ISSUE_42), [
    '# Issue #42: Pay by card',
    '',
    'https://dev.azure.com/acme/Shop%20Team/_workitems/edit/42',
    '',
    'As a shopper, I **pay by card** at checkout.',
    '',
    'The card is charged once.',
    '',
    '## Acceptance criteria',
    '',
    '- A declined card shows an error',
    '- An accepted card creates the order',
    '',
  ].join('\n'))
  assert.deepEqual(started(host).issueRoute, { via: 'mcp' })
  assert.deepEqual(server.requests, [{ tool: 'wit_work_item', arguments: { action: 'get', id: 42, project: 'Shop Team' } }])
  assert.deepEqual(host.codeHost.issuesRead, [])
})

test('a description and criteria written in Markdown are kept as written, a missing one says which field it was', async () => {
  const markdown = { ...USER_STORY, 'System.Description': 'As a shopper, I **pay by card**.\n\n- once', 'Microsoft.VSTS.Common.AcceptanceCriteria': '1. A declined card shows an error\n2. Rows with a < b stay' }
  const noCriteria = { ...USER_STORY, 'Microsoft.VSTS.Common.AcceptanceCriteria': undefined }
  const noDescription = { ...USER_STORY, 'System.Description': '   ', 'Microsoft.VSTS.Common.AcceptanceCriteria': '- The card is charged once' }
  const kept = async (fields) => (await startOn({ mcp: { workItems: { 42: fields } } })).host.tracking.read(SLUG, ISSUE_42)

  assert.equal((await kept(markdown)).split('\n\n').slice(2).join('\n\n'), 'As a shopper, I **pay by card**.\n\n- once\n\n## Acceptance criteria\n\n1. A declined card shows an error\n2. Rows with a < b stay\n')
  assert.match(await kept(noCriteria), /\n\n## Acceptance criteria\n\nThe work item has no acceptance criteria: Microsoft\.VSTS\.Common\.AcceptanceCriteria is empty, or its work item type does not have it\.\n$/)
  assert.match(await kept(noDescription), /^[^\n]*\n\n[^\n]*\n\nThe work item has no description \(System\.Description is empty\)\.\n\n## Acceptance criteria\n\n- The card is charged once\n$/)
})

test('a work item that is no story is refused: nothing is kept, journaled nor activated', async () => {
  for (const type of ['Epic', 'Task', 'Feature']) {
    const { host, outcome } = await startOn({ mcp: { workItems: { 42: { ...USER_STORY, 'System.WorkItemType': type } } } })

    assert.deepEqual([outcome.ok, outcome.code, outcome.reason], [false, 'issue-not-a-story', 'work item #42 is not a story (its type is not one skraft starts a run from); start the run with the number of a user story, product backlog item, requirement, issue or bug'], type)
    assert.deepEqual([host.events(), await host.tracking.list(SLUG, ''), await host.tracking.current()], [[], [], null], type)
  }
  for (const type of ['User Story', 'Product Backlog Item', 'Requirement', 'Issue', 'Bug']) {
    assert.equal((await startOn({ mcp: { workItems: { 42: { ...USER_STORY, 'System.WorkItemType': type } } } })).outcome.ok, true, type)
  }
})

test('a work item of another project of the organization is refused, its project named by the Git remote\'s', async () => {
  for (const project of ['Other', 'OTHER shop']) {
    const { host, outcome } = await startOn({ mcp: { workItems: { 42: { ...USER_STORY, 'System.TeamProject': project } } } })

    assert.deepEqual([outcome.ok, outcome.code, outcome.reason], [false, 'issue-in-other-project', 'work item #42 is in another project than Shop Team, the Git remote\'s; start the run with a work item of Shop Team'], project)
    assert.deepEqual([host.events(), await host.tracking.current()], [[], null], project)
  }
  assert.equal((await startOn({ mcp: { workItems: { 42: { ...USER_STORY, 'System.TeamProject': 'shop team' } } } })).outcome.ok, true, 'project names compare without case')
})

/** What az says of work item 42 when the server does not: the story as the az double holds it. */
const AZ_STORY = Object.freeze({ title: 'Pay by card (az)', body: 'Read by az.' })

test('a work item the server names in another organization is not read: az serves instead, and the journal says why', async () => {
  const elsewhere = { wit_work_item: ({ id }) => ({ id, url: `https://dev.azure.com/evil/_apis/wit/workItems/${id}`, fields: { ...USER_STORY, 'System.Title': 'Forged' } }) }
  const { host, outcome } = await startOn({ az: { issues: { 42: AZ_STORY } }, mcp: { answers: elsewhere } })

  assert.equal(outcome.ok, true)
  assert.deepEqual([host.codeHost.issuesRead, started(host).issueRoute], [[42], { via: 'az', fallback: 'mcp-unreadable' }])
  assert.match(await host.tracking.read(SLUG, ISSUE_42), /Read by az\./)
  assert.doesNotMatch(await host.tracking.read(SLUG, ISSUE_42), /Forged/)
})

test('every failure of the Azure DevOps MCP server on a read falls back on az, which reads what it reads, and the journal says az served and why', async () => {
  for (const [failure, why] of [['mcp-unavailable', 'mcp-unavailable'], ['mcp-tool-missing', 'mcp-tool-missing'], ['mcp-failed', 'mcp-failed'], ['mcp-refused', 'mcp-refused'], ['unreadable', 'mcp-unreadable']]) {
    const { host, outcome } = await startOn({ az: { issues: { 42: AZ_STORY } }, mcp: { fails: { wit_work_item: failure } } })

    assert.equal(outcome.ok, true, failure)
    assert.deepEqual([host.codeHost.issuesRead, started(host).issueRoute], [[42], { via: 'az', fallback: why }], failure)
  }
  const truncated = { wit_work_item: ({ id }) => ({ id, url: 'https://dev.azure.com/acme/_apis/wit/workItems/42', fields: { ...USER_STORY, 'System.Title': 7 } }) }
  const { host } = await startOn({ az: { issues: { 42: AZ_STORY } }, mcp: { answers: truncated } })
  assert.deepEqual(started(host).issueRoute, { via: 'az', fallback: 'mcp-unreadable' }, 'a work item without a title is no story')
})

test('only the server named ado is asked: any other server goes unasked and az serves', async () => {
  const { host, server } = await startOn({ az: { issues: { 42: AZ_STORY } }, mcp: { servers: ['ado-remote-mcp', 'azure-devops', 'my-ado'] } })

  assert.deepEqual([server.calls, host.codeHost.issuesRead, started(host).issueRoute], [[], [42], { via: 'az', fallback: 'mcp-unavailable' }])
  const known = await startOn({ mcp: { servers: ['ado-remote-mcp', 'ado'] } })
  assert.deepEqual([...new Set(known.server.calls)], ['ado wit_work_item'])
})

test('a remote that names no Azure DevOps repository is never read through the server: az serves', async () => {
  const codeHost = new InMemoryCodeHost({ pages: 'https://dev.azure.com/acme', repository: null, issues: { 42: AZ_STORY } })
  const host = pipelineHost({ forge: 'azure-devops', config: { forge: 'azure-devops' }, codeHost, git: new InMemoryGit({ remote: 'https://example.com/acme/payment.git' }) })
  const server = new InMemoryAzureMcp({ workItems: { 42: USER_STORY } })
  host.deps.mcpTools = server

  await host.init({ story: STORY.story, base: null })
  assert.deepEqual(server.calls, [])
})

test('when the server and az both fail to read the work item, the run starts on its number and title, the journal keeping why', async () => {
  const { host, outcome } = await startOn({ mcp: { fails: { wit_work_item: 'unreadable' } } })

  assert.equal(outcome.ok, true)
  assert.match(outcome.reason, new RegExp(`the body of issue #42 was not read \\(${NO_AZ}\\)`))
  assert.deepEqual([started(host).issueUnread, started(host).issueRoute], [NO_AZ, { via: 'az', fallback: 'mcp-unreadable' }])
  assert.deepEqual((await host.tracking.list(SLUG, '')).filter((path) => path.includes('issue-42')), [])
})

test('a work item neither the server nor az finds is refused as no issue of the forge', async () => {
  const { host, outcome } = await startOn({ az: { issues: {} }, mcp: { workItems: {} } })

  assert.deepEqual([outcome.ok, outcome.code, host.codeHost.issuesRead], [false, 'issue-not-found', [42]])
  assert.deepEqual(host.events(), [])
})
