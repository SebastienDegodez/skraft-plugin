import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAzureMcp, InMemoryCodeHost, InMemoryGit } from '../support/in-memory-host.mjs'
import { nominal, REFS_42, scripted, SLUG } from '../support/pipeline-host.mjs'

const REMOTE = 'https://dev.azure.com/acme/Shop%20Team/_git/payment'
const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const COMMENT_URL = (id) => `https://dev.azure.com/acme/Shop%20Team/_apis/wit/workItems/42/comments/${id}`
const USER_STORY = Object.freeze({ 'System.WorkItemType': 'User Story', 'System.TeamProject': 'Shop Team', 'System.Title': 'Pay by card' })
const MARKER = `<!-- skraft:issue-progress slug=${SLUG} -->`
const WRITE = 'wit_work_item_comment_write'

/**
 * A host about to start a run from work item 42, on a working copy whose remote is an Azure Repos
 * repository of the project Shop Team; the az double stands for az, the host's MCP server for `ado`.
 * @param {{ az?: object, mcp?: object | null, server?: InMemoryAzureMcp }} [options] az: what the az double is told; mcp: the
 *   server's options, none without a server; server: a server to give, in place of one built from mcp
 */
const begin = async ({ az = {}, mcp = {}, server = mcp === null ? null : new InMemoryAzureMcp({ workItems: { 42: USER_STORY }, ...mcp }) } = {}) => {
  const codeHost = new InMemoryCodeHost({ pages: 'https://dev.azure.com/acme', link: (number) => `AB#${number}`, bodyLimit: 4_000, repository: null, ...az })
  const host = scripted({ config: CONSENTED, forge: 'azure-devops', codeHost, git: new InMemoryGit({ remote: REMOTE }) }, (it) => nominal(it, REFS_42))
  if (server !== null) host.deps.mcpTools = server
  const initialised = await host.init(STORY)
  assert.equal(initialised.ok, true, initialised.reason)
  return { host, server }
}

/** A run from work item 42 to its pull request. @param {Parameters<typeof begin>[0]} [options] */
const runOn = async (options) => {
  const { host, server } = await begin(options)
  return { host, server, outcome: await host.run() }
}

/** The journal events of the progress comment, in order. @param {Awaited<ReturnType<typeof runOn>>['host']} host */
const progress = (host) => host.events().filter(({ type }) => type === 'issue.commented' || type === 'issue.comment-skipped')

test('with the host\'s Azure DevOps MCP server, the run posts one comment on its work item at the first transition and rewrites it at each later one, and the journal says the server kept it', async () => {
  const { host, server, outcome } = await runOn()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(progress(host).map(({ type, url, via }) => [type, url, via]), Array(6).fill(['issue.commented', COMMENT_URL(701), 'mcp']))
  assert.equal(server.comments.length, 1, 'one comment, rewritten at each transition')
  assert.equal(server.comments[0].texts.length, 6)
  const writes = server.requests.filter(({ tool }) => tool === WRITE).map(({ arguments: { text, ...rest } }) => rest)
  assert.deepEqual(writes, [
    { action: 'add', project: 'Shop Team', workItemId: 42, format: 'Markdown' },
    ...Array(5).fill({ action: 'update', project: 'Shop Team', workItemId: 42, commentId: 701, format: 'Markdown' }),
  ])
  assert.deepEqual(host.codeHost.calls.filter((call) => call.startsWith('keep comment')), [], 'az is asked nothing')
  assert.ok(!server.comments[0].text.includes('.copilot-tracking/'), 'no path of the machine in the comment')
})

/** A comment a person or an earlier run left on work item 42. @param {number} id @param {string} text */
const commentOf = (id, text) => ({ id, workItemId: 42, project: 'Shop Team', text, texts: [text] })

/** The writes the server was asked, each by its action. @param {InMemoryAzureMcp} server */
const writes = (server) => server.requests.filter(({ tool }) => tool === WRITE).map(({ arguments: { action } }) => action)

test('a comment of this run the journal lost, which the server stores with its marker rewritten as HTML entities, is found again and rewritten, not posted twice', async () => {
  const server = new InMemoryAzureMcp({ workItems: { 42: USER_STORY } })
  server.comments.push(commentOf(650, 'a person'), commentOf(651, `${MARKER.replace('<', '&lt;').replace('>', '&gt;')}\nan earlier run`))
  const { host } = await runOn({ mcp: null, server })

  assert.deepEqual(writes(server), Array(6).fill('update'))
  assert.deepEqual([server.comments.length, server.comments[0].texts.length, server.comments[1].texts.length], [2, 1, 7])
  assert.deepEqual([...new Set(progress(host).map(({ url }) => url))], [COMMENT_URL(651)])
})

test('a comment a person deleted is posted again at the next transition, not rewritten into nothing', async () => {
  class Deleted extends InMemoryAzureMcp {
    listings = 0

    async call(request) {
      if (request.arguments.action === 'list_comments' && ++this.listings === 3) this.comments.length = 0
      return super.call(request)
    }
  }
  const server = new Deleted({ workItems: { 42: USER_STORY } })
  const { host } = await runOn({ mcp: null, server })

  assert.deepEqual(writes(server), ['add', 'update', 'add', 'update', 'update', 'update'])
  assert.deepEqual(progress(host).map(({ url }) => url), [701, 701, 702, 702, 702, 702].map(COMMENT_URL))
})

test('a work item that moved to another project is not written: its transitions are skipped with a fixed reason, and az is not asked', async () => {
  const server = new InMemoryAzureMcp({ workItems: { 42: USER_STORY } })
  const { host } = await begin({ server })
  server.workItems[42] = { ...USER_STORY, 'System.TeamProject': 'Other' }
  await host.run()

  assert.deepEqual(writes(server), [])
  assert.deepEqual([...new Set(progress(host).map(({ type, reason, via }) => `${type} ${via}: ${reason}`))], ['issue.comment-skipped mcp: work item #42 is not in project Shop Team of the Git remote, so skraft wrote nothing on it'])
  assert.deepEqual(host.codeHost.calls.filter((call) => call.startsWith('keep comment')), [])
})

test('a write the person or the host refuses is refused: nothing is posted, az is not asked, and the journal says why', async () => {
  const REFUSED = 'the host refused the Azure DevOps MCP server\'s wit_work_item_comment_write, so skraft wrote nothing on Azure Boards; allow it, or run again where it is allowed'
  for (const action of ['add', 'update']) {
    const server = new InMemoryAzureMcp({ workItems: { 42: USER_STORY }, fails: {} })
    if (action === 'update') server.comments.push(commentOf(650, MARKER))
    server.fails[WRITE] = 'mcp-refused'
    const { host } = await runOn({ mcp: null, server })

    assert.deepEqual([...new Set(progress(host).map(({ type, reason, via }) => `${type} ${via}: ${reason}`))], [`issue.comment-skipped mcp: ${REFUSED}`], action)
    assert.deepEqual([host.codeHost.calls.filter((call) => call.startsWith('keep comment')), server.comments.length, server.comments.at(-1)?.texts.length], [[], action === 'add' ? 0 : 1, action === 'add' ? undefined : 1], action)
  }
})

test('any other failure of the server, or a conversation too long to list in one page, sends the comment to az, which keeps it as it keeps it alone, the journal saying az served and why', async () => {
  const crowded = { pageSize: 1 }
  const cases = [
    [{ fails: { [WRITE]: 'mcp-failed' } }, 'mcp-failed'], [{ fails: { [WRITE]: 'unreadable' } }, 'mcp-unreadable'], [{ fails: { wit_work_item: 'mcp-tool-missing' } }, 'mcp-tool-missing'],
    [{ fails: { wit_work_item: 'mcp-unavailable' } }, 'mcp-unavailable'], [{ fails: { wit_work_item: 'mcp-refused' } }, 'mcp-refused'], [crowded, 'mcp-unreadable'],
    [{ answers: { [WRITE]: () => ({ posted: true }) } }, 'mcp-unreadable'],
  ]
  for (const [options, why] of cases) {
    const server = new InMemoryAzureMcp({ workItems: { 42: USER_STORY }, ...options })
    if (options === crowded) server.comments.push(commentOf(650, 'a person'), commentOf(651, 'another person'))
    const { host } = await runOn({ mcp: null, server })

    assert.deepEqual([host.codeHost.comments.length, host.codeHost.comments[0].edits, server.comments.length], [1, 5, options === crowded ? 2 : 0], why)
    assert.deepEqual([...new Set(progress(host).map(({ via, fallback }) => `${via} ${fallback}`))], [`az ${why}`], why)
    assert.equal(JSON.parse(await host.tracking.read(SLUG, 'issue-progress.request.json')).text, host.codeHost.comments[0].body, `${why}: az is handed the comment as the JSON it sends`)
  }
})

test('a work item the server names in another organization is not written to: az keeps the comment instead', async () => {
  const server = new InMemoryAzureMcp({ workItems: { 42: USER_STORY } })
  const { host } = await begin({ server })
  server.answers.wit_work_item = ({ action, id }) => (action === 'get' ? { id, url: `https://dev.azure.com/evil/_apis/wit/workItems/${id}`, fields: USER_STORY } : { comments: [] })
  await host.run()

  assert.deepEqual([writes(server), host.codeHost.comments.length], [[], 1])
  assert.deepEqual([...new Set(progress(host).map(({ via, fallback }) => `${via} ${fallback}`))], ['az mcp-unreadable'])
})
