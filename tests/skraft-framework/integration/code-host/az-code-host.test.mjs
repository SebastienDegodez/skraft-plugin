import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { createAzCodeHost } from '../../../../plugins/skraft-framework/engine/infrastructure/code-host/az-code-host.mjs'
import { createForges } from '../../../../plugins/skraft-framework/engine/infrastructure/code-host/forges.mjs'
import { createNodeCommandRunner } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { commitAll, envWithPath, git, shortLimit, tempFolder, toolFolders } from '../support/workspace.mjs'
import { azFolder, gitAlone, SIGNED_IN } from '../support/fake-az.mjs'

/** A working copy on the branch checkout, one commit ahead of main, its origin an Azure DevOps URL that pushes to a bare repository beside it. */
const repository = (t, { remote = 'https://acme@dev.azure.com/acme/Shop%20Team/_git/payment', az = SIGNED_IN } = {}) => {
  const root = tempFolder(t, 'skraft-az-')
  const cwd = join(root, 'payment')
  mkdirSync(cwd)
  writeFileSync(join(cwd, 'README.md'), '# payment\n')
  commitAll(cwd)
  git(cwd, 'branch', '-M', 'main')
  git(cwd, 'checkout', '-q', '-b', 'checkout')
  git(root, 'init', '-q', '--bare', 'remote.git')
  if (remote !== null) {
    git(cwd, 'remote', 'add', 'origin', remote)
    git(cwd, 'config', 'remote.origin.pushurl', join(root, 'remote.git'))
  }
  const forge = azFolder(root, az)
  const runner = (folders = [forge.path, ...toolFolders()]) => createNodeCommandRunner({ root: cwd, env: { ...envWithPath(folders), ...forge.env } })
  return { root, cwd, forge, codeHost: (folders) => createAzCodeHost({ commandRunner: runner(folders) }), runner, withoutAz: () => createAzCodeHost({ commandRunner: runner([gitAlone(root)]) }) }
}

/** The remote's pull requests, over the fake az: the working copy of `repository`, and a way to create the adapters of the Azure DevOps forge. */
const pullRequestsOn = (t, options) => {
  const on = repository(t, options)
  return { ...on, createdPullRequests: () => createForges({ commandRunner: on.runner() })['azure-devops'].pullRequests }
}

/** What every call to Azure DevOps names: its organization, project and repository, as JSON, with no question asked. */
const ON_SHOP = ['--organization=https://dev.azure.com/acme', '--project=Shop Team', '--repository=payment', '--detect=false', '--only-show-errors', '--output=json']

test('a pull request can be opened once the remote names an Azure DevOps repository, az and its azure-devops extension are installed, and az is signed in to that organization', async (t) => {
  assert.equal(await repository(t, { remote: null }).codeHost().unavailable(), 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository')
  assert.equal(await repository(t, { remote: 'https://github.com/acme/payment.git' }).codeHost().unavailable(), 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository')

  const { forge, codeHost, withoutAz } = repository(t)
  assert.equal(await withoutAz().unavailable(), 'az, the Azure CLI, is not installed')
  forge.set({ extension: false })
  assert.equal(await codeHost().unavailable(), 'the azure-devops extension of the Azure CLI is not installed; run az extension add --name azure-devops')
  forge.set({ signedIn: false })
  assert.equal(await codeHost().unavailable(), 'az is not signed in to the Azure DevOps organization https://dev.azure.com/acme, or cannot read Shop Team/payment there; run az login, or az devops login --organization https://dev.azure.com/acme')
  forge.set({})
  assert.equal(await codeHost().unavailable(), null)
  assert.deepEqual(forge.calls().slice(-3), [['--version'], ['extension', 'show', '--name=azure-devops', '--only-show-errors', '--output=json'], ['repos', 'show', ...ON_SHOP]])
})

// cmd.exe stands for itself: it keeps a mark of any start, git included, and answers nothing.
test('under Windows an az that is not the Azure CLI installer\'s is refused before any process starts, and the reason says how to install it', { skip: process.platform === 'win32' && 'Windows rules are simulated here' }, async (t) => {
  const { root, cwd, forge } = repository(t)
  const bin = join(root, 'windows')
  mkdirSync(bin)
  for (const name of ['git.cmd', 'az.cmd']) writeFileSync(join(bin, name), '')
  const cmd = join(root, 'cmd.exe')
  writeFileSync(cmd, [
    `#!${process.execPath}`,
    `require('node:fs').appendFileSync(${JSON.stringify(join(root, 'cmd-started'))}, process.argv[5])`,
    'process.exit(1)',
    '',
  ].join('\n'))
  chmodSync(cmd, 0o755)
  const windows = createAzCodeHost({ commandRunner: createNodeCommandRunner({ root: cwd, platform: 'win32', env: { Path: bin, PATHEXT: '.cmd', ComSpec: cmd } }) })

  assert.equal(await windows.unavailable(), 'skraft runs az under Windows only from the Azure CLI installer (MSI or winget), which starts it without cmd.exe; install the Azure CLI that way')
  assert.deepEqual([existsSync(join(root, 'cmd-started')), forge.calls()], [false, []])
})

test('the organization, project and repository are read from every URL Azure DevOps gives a remote; a repository named alone is its project\'s namesake', async (t) => {
  const remotes = {
    'https://dev.azure.com/acme/Shop%20Team/_git/payment': ['https://dev.azure.com/acme', 'Shop Team'],
    'git@ssh.dev.azure.com:v3/acme/Shop%20Team/payment': ['https://dev.azure.com/acme', 'Shop Team'],
    'ssh://git@ssh.dev.azure.com:22/v3/acme/Shop%20Team/payment': ['https://dev.azure.com/acme', 'Shop Team'],
    'https://acme.visualstudio.com/Shop%20Team/_git/payment': ['https://acme.visualstudio.com', 'Shop Team'],
    'https://acme.visualstudio.com/DefaultCollection/Shop%20Team/_git/payment/': ['https://acme.visualstudio.com', 'Shop Team'],
    'acme@vs-ssh.visualstudio.com:v3/acme/Shop%20Team/payment': ['https://acme.visualstudio.com', 'Shop Team'],
    'https://dev.azure.com/acme/_git/payment': ['https://dev.azure.com/acme', 'payment'],
    'https://acme.visualstudio.com/DefaultCollection/_git/payment': ['https://acme.visualstudio.com', 'payment'],
    'https://acme.visualstudio.com/_git/payment': ['https://acme.visualstudio.com', 'payment'],
  }
  for (const [remote, [organization, project]] of Object.entries(remotes)) {
    const { forge, codeHost } = repository(t, { remote })
    assert.equal(await codeHost().defaultBranch(), 'main', remote)
    assert.deepEqual(forge.calls().at(-1), ['repos', 'show', `--organization=${organization}`, `--project=${project}`, ...ON_SHOP.slice(2)], remote)
  }
})

test('the branch HEAD is on is pushed to the same branch of the remote, never forced; a remote that moved refuses it', async (t) => {
  const { root, cwd, codeHost } = repository(t)
  const host = codeHost()

  assert.deepEqual(await host.remotes(), ['origin'])
  assert.equal(await host.currentBranch(), 'checkout')
  assert.deepEqual(await host.push('checkout'), { ok: true })
  assert.equal(git(root, '--git-dir', join(root, 'remote.git'), 'rev-parse', 'refs/heads/checkout'), git(cwd, 'rev-parse', 'HEAD'))

  git(cwd, 'commit', '-q', '--amend', '-m', 'initial, again')
  assert.deepEqual(await host.push('checkout'), { ok: false, reason: 'git push of checkout to origin failed or was refused' })
  assert.deepEqual(await repository(t, { remote: null }).codeHost().push('checkout'), { ok: false, reason: 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository' })
})

test('the pull request is opened from a body file, linked to the story\'s work item, then found by its source branch whatever its state and its description replaced; az\'s output never reaches a reason', async (t) => {
  const { root, forge, codeHost } = repository(t)
  const host = codeHost()
  const bodyFile = join(root, 'body.md')
  writeFileSync(bodyFile, 'Fixes #42\n\n## What changes\n')
  const url = 'https://dev.azure.com/acme/Shop%20Team/_git/payment/pullrequest/7'

  assert.deepEqual(await host.findPullRequest('checkout'), { ok: true, found: null })
  assert.deepEqual(await host.create({ base: 'main', head: 'checkout', title: '-x Pay by card', bodyFile, draft: true, issue: 42 }), { ok: true, number: 7, url })
  await host.create({ base: 'main', head: 'checkout', title: 'Pay by card', bodyFile, draft: false, issue: null })
  assert.equal(forge.bodies(), 'Fixes #42\n\n## What changes\n'.repeat(2))
  for (const [status, state] of [['active', 'open'], ['abandoned', 'closed'], ['completed', 'merged']]) {
    forge.set({ pulls: [{ pullRequestId: 7, status, description: 'Paid.' }] })
    assert.deepEqual(await host.findPullRequest('checkout'), { ok: true, found: { number: 7, url, state, body: 'Paid.' } })
  }
  forge.set({ pulls: [{ pullRequestId: 7, status: 'active', description: null }] })
  assert.deepEqual(await host.findPullRequest('checkout'), { ok: true, found: { number: 7, url, state: 'open', body: '' } }, 'a pull request without a description has an empty body')
  forge.set({ pulls: [{ pullRequestId: 5, status: 'completed', description: 'First.' }, { pullRequestId: 9, status: 'active', description: 'Latest.' }, { pullRequestId: 7, status: 'abandoned', description: 'Second.' }] })
  assert.deepEqual(await host.findPullRequest('checkout'), { ok: true, found: { number: 9, url: url.replace(/7$/, '9'), state: 'open', body: 'Latest.' } }, 'the latest is the highest number, whatever order Azure DevOps lists them in')
  assert.deepEqual(await host.edit({ number: 7, bodyFile }), { ok: true })
  assert.deepEqual(forge.calls().filter(([command]) => command === 'repos').slice(0, 4).concat(forge.calls().slice(-1)), [
    ['repos', 'pr', 'list', '--source-branch=refs/heads/checkout', '--status=all', ...ON_SHOP],
    ['repos', 'pr', 'create', '--source-branch=checkout', '--target-branch=main', '--title=-x Pay by card', `--description=@${bodyFile}`, '--draft=true', '--work-items=42', ...ON_SHOP],
    ['repos', 'pr', 'create', '--source-branch=checkout', '--target-branch=main', '--title=Pay by card', `--description=@${bodyFile}`, ...ON_SHOP],
    ['repos', 'pr', 'list', '--source-branch=refs/heads/checkout', '--status=all', ...ON_SHOP],
    ['repos', 'pr', 'update', '--id=7', `--description=@${bodyFile}`, '--organization=https://dev.azure.com/acme', '--detect=false', '--only-show-errors', '--output=json'],
  ])

  for (const pulls of ['Not JSON at all', { pullRequestId: 7 }, [null], [{ status: 'active' }], [{ pullRequestId: '7', status: 'active' }], [{ pullRequestId: 7, status: 'active', description: 42 }]]) {
    forge.set({ pulls })
    assert.deepEqual(await host.findPullRequest('checkout'), { ok: false, reason: 'az could not list the pull requests of Shop Team/payment' })
  }
  forge.set({ created: 'Not JSON at all' })
  assert.deepEqual(await host.create({ base: 'main', head: 'checkout', title: 'Pay by card', bodyFile, draft: true, issue: 42 }), { ok: false, reason: 'az could not open the pull request of checkout on Shop Team/payment' })
  forge.set({ fails: true })
  assert.deepEqual(await host.findPullRequest('checkout'), { ok: false, reason: 'az could not list the pull requests of Shop Team/payment' })
  assert.deepEqual(await host.create({ base: 'main', head: 'checkout', title: 'Pay by card', bodyFile, draft: true, issue: 42 }), { ok: false, reason: 'az could not open the pull request of checkout on Shop Team/payment' })
  assert.deepEqual(await host.edit({ number: 7, bodyFile }), { ok: false, reason: 'az could not update pull request #7 on Shop Team/payment' })
  assert.equal(await host.defaultBranch(), null)
})

test('a work item Azure DevOps refuses to link leaves the pull request opened without the link, said in a fixed note: the one opened anyway is kept, else it is opened again without it', async (t) => {
  const { root, forge, codeHost } = repository(t, { az: { ...SIGNED_IN, refusedWorkItem: true } })
  const host = codeHost()
  const bodyFile = join(root, 'body.md')
  writeFileSync(bodyFile, 'Fixes #999\n')
  const note = 'it is not linked to work item #999, which Azure DevOps refused to link'
  const page = (number) => `https://dev.azure.com/acme/Shop%20Team/_git/payment/pullrequest/${number}`

  assert.deepEqual(await host.create({ base: 'main', head: 'checkout', title: 'Pay', bodyFile, draft: false, issue: 999 }), { ok: true, number: 7, url: page(7), note })
  assert.deepEqual(forge.calls().map((call) => call.slice(0, 3).concat(call.filter((arg) => arg.startsWith('--work-items=')))), [
    ['repos', 'pr', 'create', '--work-items=999'], ['repos', 'pr', 'list'], ['repos', 'pr', 'create'],
  ])

  forge.set({ refusedWorkItem: true, pulls: [{ pullRequestId: 8, status: 'active', description: 'Fixes #999' }] })
  assert.deepEqual(await host.create({ base: 'main', head: 'checkout', title: 'Pay', bodyFile, draft: false, issue: 999 }), { ok: true, number: 8, url: page(8), note })
  assert.deepEqual(forge.calls().slice(3).map((call) => call[2]), ['create', 'list'], 'a pull request Azure DevOps opened despite the refusal is not opened twice')
})

test('an Azure Repos pull request toward the default branch fixes its story\'s work item and names it otherwise; a review keeps its consent for the organization, project and repository of the remote, from the remote alone', async (t) => {
  const { forge, runner } = repository(t, { remote: 'https://acme.visualstudio.com/DefaultCollection/Shop%20Team/_git/payment' })
  const { codeHost, pullRequests } = createForges({ commandRunner: runner() })['azure-devops']

  assert.deepEqual([codeHost.storyLink(42, true), codeHost.storyLink(7, false)], ['Fixes #42', '#7'])
  assert.deepEqual(await codeHost.repository(), null, 'no screenshot link is built for a forge whose raw file URLs skraft does not write')
  assert.deepEqual(await pullRequests.repository(), { host: 'dev.azure.com', repository: 'acme/Shop Team/payment' })
  assert.deepEqual([pullRequests.checkoutCommand(12), pullRequests.takesRequestFile], ['az repos pr checkout --id 12', true])
  assert.deepEqual(forge.calls(), [])
})

const SHOP_STORY = {
  id: 42,
  url: 'https://dev.azure.com/acme/_apis/wit/workItems/42',
  fields: {
    'System.WorkItemType': 'User Story',
    'System.TeamProject': 'Shop Team',
    'System.Title': 'Pay by card',
    'System.Description': '<p>As a shopper, I <strong>pay by card</strong> at checkout.</p><p>The card is charged once.</p>',
    'Microsoft.VSTS.Common.AcceptanceCriteria': '<ul><li>A declined card shows an error</li><li>An accepted card creates the order</li></ul>',
  },
}
const WORK_ITEM_42 = ['boards', 'work-item', 'show', '--id=42', '--organization=https://dev.azure.com/acme', '--detect=false', '--only-show-errors', '--output=json']

test('the story is read from its Azure Boards work item through az: its HTML becomes the Markdown the MCP route gives, and only a story of the remote\'s project is read', async (t) => {
  const { forge, codeHost } = repository(t, { az: { ...SIGNED_IN, workItems: { 42: SHOP_STORY } } })
  const host = codeHost()

  assert.deepEqual(await host.issue(42), {
    read: 'issue',
    issue: {
      number: 42,
      title: 'Pay by card',
      url: 'https://dev.azure.com/acme/Shop%20Team/_workitems/edit/42',
      body: 'As a shopper, I **pay by card** at checkout.\n\nThe card is charged once.\n\n## Acceptance criteria\n\n- A declined card shows an error\n- An accepted card creates the order',
    },
  })
  assert.deepEqual(forge.calls().at(-1), WORK_ITEM_42)

  forge.set({ workItems: { 42: { ...SHOP_STORY, fields: { ...SHOP_STORY.fields, 'System.WorkItemType': 'Epic' } } } })
  assert.deepEqual(await host.issue(42), { read: 'not-a-story' })
  forge.set({ workItems: { 42: { ...SHOP_STORY, fields: { ...SHOP_STORY.fields, 'System.TeamProject': 'Other' } } } })
  assert.deepEqual(await host.issue(42), { read: 'other-project', project: 'Shop Team' })
})

test('a work item az does not find is missing; one az cannot read, or answers in a form skraft cannot read, or a sign-in az lacks, is a fixed reason that holds no output of az', async (t) => {
  const { forge, codeHost } = repository(t, { az: { ...SIGNED_IN, workItems: {} } })
  const host = codeHost()

  assert.deepEqual(await host.issue(42), { read: 'missing' })
  forge.set({ workItemFails: true })
  assert.deepEqual(await host.issue(42), { read: 'failed', reason: 'az could not read work item #42 of https://dev.azure.com/acme' })
  for (const answer of ['not JSON', { id: 7, fields: SHOP_STORY.fields }, { id: 42 }, { id: 42, fields: { ...SHOP_STORY.fields, 'System.Title': 7 } }, { id: 42, fields: { ...SHOP_STORY.fields, 'System.Description': 7 } }]) {
    forge.set({ workItemFails: false, workItems: { 42: answer } })
    assert.deepEqual(await host.issue(42), { read: 'failed', reason: 'Azure DevOps answered work item #42 in a form skraft cannot read' })
  }
  forge.set({ signedIn: false })
  const calls = forge.calls().length
  assert.deepEqual(await host.issue(42), { read: 'failed', reason: 'az is not signed in to the Azure DevOps organization https://dev.azure.com/acme, or cannot read Shop Team/payment there; run az login, or az devops login --organization https://dev.azure.com/acme' })
  assert.ok(forge.calls().slice(calls).every(([command]) => command !== 'boards'), 'no work item is asked of an az that cannot be reached')
  assert.deepEqual(await repository(t, { remote: null }).codeHost().issue(42), { read: 'failed', reason: 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository' })
})

const MARKER = '<!-- skraft:issue-progress slug=checkout -->'
const COMMENTS_ON_42 = ['--area=wit', '--resource=comments']
const QUIET_INVOKE = ['--api-version=7.2-preview.4', '--organization=https://dev.azure.com/acme', '--only-show-errors', '--output=json']
const COMMENT_URL = (id) => `https://dev.azure.com/acme/Shop%20Team/_apis/wit/workItems/42/comments/${id}`
const IN_STORY = { workItems: { 42: SHOP_STORY } }

/** The request a comment of the run is kept with: the body as the file az sends, as the engine writes it. */
const commentRequest = (root, { url = null, body = `${MARKER}\n### skraft · checkout — RESEARCH closed\n` } = {}) => {
  const requestFile = join(root, 'issue-progress.request.json')
  writeFileSync(requestFile, JSON.stringify({ text: body }))
  return { number: 42, marker: MARKER, url, bodyFile: join(root, 'issue-progress.md'), requestFile, body }
}

test('the run\'s comment is posted on its work item through az devops invoke, the Markdown sent from a JSON file, and the REST address of the comment is given back', async (t) => {
  const { root, forge, codeHost } = repository(t, { az: { ...SIGNED_IN, ...IN_STORY } })
  const request = commentRequest(root)

  assert.deepEqual(await codeHost().keepIssueComment(request), { ok: true, url: COMMENT_URL(500) })
  assert.deepEqual(forge.calls().slice(-3), [
    WORK_ITEM_42,
    ['devops', 'invoke', ...COMMENTS_ON_42, '--route-parameters', 'project=Shop Team', 'workItemId=42', ...QUIET_INVOKE],
    ['devops', 'invoke', ...COMMENTS_ON_42, '--route-parameters', 'project=Shop Team', 'workItemId=42', '--http-method=POST', '--query-parameters', 'format=0', `--in-file=${request.requestFile}`, ...QUIET_INVOKE],
  ])
  assert.deepEqual(forge.writes().map(({ method, text }) => [method, text]), [['POST', request.body]])
})

test('the comment at the URL kept is rewritten in place; without one, the latest comment holding the marker, as written or escaped as HTML; none holding it is posted', async (t) => {
  const escaped = MARKER.replace('<', '&lt;').replace('>', '&gt;')
  const comments = [{ id: 500, text: `${MARKER}\nolder` }, { id: 501, text: 'a person' }, { id: 502, text: `${escaped}\nlatest` }]
  const { root, forge, codeHost } = repository(t, { az: { ...SIGNED_IN, ...IN_STORY, comments } })
  const host = codeHost()

  assert.deepEqual(await host.keepIssueComment(commentRequest(root, { url: COMMENT_URL(501) })), { ok: true, url: COMMENT_URL(501) })
  assert.deepEqual(await host.keepIssueComment(commentRequest(root)), { ok: true, url: COMMENT_URL(502) })
  assert.deepEqual(forge.writes().map(({ method, route, query }) => [method, route.commentId, query]), [['PATCH', '501', {}], ['PATCH', '502', {}]])
  assert.deepEqual(forge.calls().at(-1), ['devops', 'invoke', ...COMMENTS_ON_42, '--route-parameters', 'project=Shop Team', 'workItemId=42', 'commentId=502', '--http-method=PATCH', `--in-file=${join(root, 'issue-progress.request.json')}`, ...QUIET_INVOKE])

  const fresh = repository(t, { az: { ...SIGNED_IN, ...IN_STORY, comments: [{ id: 500, text: 'a person' }] } })
  assert.deepEqual(await fresh.codeHost().keepIssueComment(commentRequest(fresh.root, { url: COMMENT_URL(999) })), { ok: true, url: COMMENT_URL(501) }, 'a comment a person deleted is posted again')
  assert.deepEqual(fresh.forge.writes().map(({ method }) => method), ['POST'])
})

test('a conversation longer than one page is read page by page, up to ten pages; a longer one is never written to, since the run\'s comment could be past them', async (t) => {
  const many = (count, marked) => Array.from({ length: count }, (_, index) => ({ id: 500 + index, text: index === marked ? `${MARKER}\nmine` : 'a person' }))
  const paged = repository(t, { az: { ...SIGNED_IN, ...IN_STORY, pageSize: 2, comments: many(7, 6) } })
  assert.deepEqual(await paged.codeHost().keepIssueComment(commentRequest(paged.root)), { ok: true, url: COMMENT_URL(506) })
  assert.deepEqual(paged.forge.calls().filter((call) => call.includes('--query-parameters') && call.includes('continuationToken=2')).length, 1)
  assert.deepEqual(paged.forge.calls().filter((call) => call.includes('--query-parameters')).map((call) => call[call.indexOf('--query-parameters') + 1]), ['continuationToken=2', 'continuationToken=4', 'continuationToken=6'])

  const tooLong = repository(t, { az: { ...SIGNED_IN, ...IN_STORY, pageSize: 1, comments: many(30, 29) } })
  assert.deepEqual(await tooLong.codeHost().keepIssueComment(commentRequest(tooLong.root)), { ok: false, reason: 'az could not comment work item #42 of Shop Team' })
  assert.deepEqual(tooLong.forge.writes(), [])
  assert.equal(tooLong.forge.calls().filter((call) => call[0] === 'devops').length, 10)
})

test('a work item of another project is never written to, an az that fails or answers what skraft cannot read writes nothing twice, and none of what az prints reaches a reason', async (t) => {
  const elsewhere = repository(t, { az: { ...SIGNED_IN, workItems: { 42: { ...SHOP_STORY, fields: { ...SHOP_STORY.fields, 'System.TeamProject': 'Other' } } } } })
  assert.deepEqual(await elsewhere.codeHost().keepIssueComment(commentRequest(elsewhere.root)), { ok: false, reason: 'work item #42 is not in project Shop Team of the Git remote, so skraft wrote nothing on it' })
  assert.deepEqual(elsewhere.forge.calls().filter((call) => call[0] === 'devops'), [])

  const failing = { commentFails: true }
  for (const [state, reason] of [
    [{ workItems: {} }, 'az could not read work item #42 of https://dev.azure.com/acme'],
    [{ workItems: { 42: 'not json' } }, 'Azure DevOps answered work item #42 in a form skraft cannot read'],
    [{ unreadableList: true }, 'az could not comment work item #42 of Shop Team'],
    [{ unreadableWrite: true }, 'az could not comment work item #42 of Shop Team'],
    [failing, 'az could not comment work item #42 of Shop Team'],
  ]) {
    const { root, forge, codeHost } = repository(t, { az: { ...SIGNED_IN, ...IN_STORY, ...state } })
    const kept = await codeHost().keepIssueComment(commentRequest(root))

    assert.deepEqual(kept, { ok: false, reason }, JSON.stringify(state))
    assert.ok(forge.writes().length <= 1, 'never posted twice')
  }

  const signedOut = repository(t, { az: { ...SIGNED_IN, ...IN_STORY, signedIn: false } })
  const refused = await signedOut.codeHost().keepIssueComment(commentRequest(signedOut.root))
  assert.deepEqual(refused, { ok: false, reason: 'az is not signed in to the Azure DevOps organization https://dev.azure.com/acme, or cannot read Shop Team/payment there; run az login, or az devops login --organization https://dev.azure.com/acme' })
  assert.deepEqual(signedOut.forge.calls().filter((call) => call[0] === 'boards' || call[0] === 'devops'), [])
})

test('through az, a comment that quotes the marker without starting with it is someone else\'s: never rewritten, the run posts its own; a comment without an integer id is never written to', async (t) => {
  const reply = { id: 500, text: `> ${MARKER}\nI disagree` }
  const { root, forge, codeHost } = repository(t, { az: { ...SIGNED_IN, ...IN_STORY, comments: [reply] } })

  assert.deepEqual(await codeHost().keepIssueComment(commentRequest(root)), { ok: true, url: COMMENT_URL(501) })
  assert.deepEqual(forge.writes().map(({ method }) => method), ['POST'])
  assert.equal(forge.comments()[0].text, reply.text)

  for (const comments of [[{ text: MARKER }], [{ id: '500', text: MARKER }]]) {
    const unreadable = repository(t, { az: { ...SIGNED_IN, ...IN_STORY, comments } })
    assert.deepEqual(await unreadable.codeHost().keepIssueComment(commentRequest(unreadable.root)), { ok: false, reason: 'az could not comment work item #42 of Shop Team' }, JSON.stringify(comments))
    assert.deepEqual(unreadable.forge.writes(), [], JSON.stringify(comments))
  }
})

const DETAILS_MARKER = '<!-- skraft:run-details slug=checkout part=1 -->'
const THREADS_ON_42 = ['--area=git', '--resource=pullRequestThreads', '--route-parameters', 'project=Shop Team', 'repositoryId=payment', 'pullRequestId=42']
const QUIET_THREADS = ['--api-version=7.1', '--organization=https://dev.azure.com/acme', '--only-show-errors', '--output=json']
const DETAILS_THREAD_URL = (thread, comment) => `https://dev.azure.com/acme/Shop%20Team/_apis/git/repositories/payment/pullRequests/42/threads/${thread}/comments/${comment}`
const DETAILS = `${DETAILS_MARKER}\n# skraft · run details\n\nThe folded sections.\n`

/** The request a run details comment is kept with: the body, the thread to post and the comment to rewrite, as the engine writes them. */
const detailsRequest = (root, { url = null, body = DETAILS } = {}) => {
  const threadFile = join(root, 'pull-request-details-1.thread.json')
  const commentFile = join(root, 'pull-request-details-1.comment.json')
  writeFileSync(threadFile, JSON.stringify({ comments: [{ parentCommentId: 0, content: body, commentType: 1 }], status: 4 }))
  writeFileSync(commentFile, JSON.stringify({ content: body }))
  return { number: 42, marker: DETAILS_MARKER, url, bodyFile: join(root, 'pull-request-details-1.md'), body, threadFile, commentFile }
}

test('the run details are posted as a thread of the pull request through az devops invoke, closed, sent from a JSON file, and the REST address of its comment is given back', async (t) => {
  const { root, forge, codeHost } = repository(t)
  const request = detailsRequest(root)

  assert.deepEqual(await codeHost().keepPullRequestComment(request), { ok: true, url: DETAILS_THREAD_URL(41, 1) })
  assert.deepEqual(forge.calls().slice(-2), [
    ['devops', 'invoke', ...THREADS_ON_42, ...QUIET_THREADS],
    ['devops', 'invoke', ...THREADS_ON_42, '--http-method=POST', `--in-file=${request.threadFile}`, ...QUIET_THREADS],
  ])
  assert.deepEqual(forge.threadWrites().map(({ method, sent }) => [method, sent]), [['POST', { comments: [{ parentCommentId: 0, content: DETAILS, commentType: 1 }], status: 4 }]])
})

test('the comment of the thread at the URL kept is rewritten in place; without one, the first comment of the latest thread that starts with the marker, as written or escaped; none is posted again', async (t) => {
  const escaped = DETAILS_MARKER.replace('<', '&lt;').replace('>', '&gt;')
  const threads = [{ id: 300, comments: [{ id: 1, content: `${DETAILS_MARKER}\nolder` }] }, { id: 301, comments: [{ id: 1, content: 'a person' }] }, { id: 302, comments: [{ id: 4, content: `${escaped}\nlatest` }, { id: 5, content: 'a reply' }] }]
  const { root, forge, codeHost } = repository(t, { az: { ...SIGNED_IN, threads } })
  const host = codeHost()

  assert.deepEqual(await host.keepPullRequestComment(detailsRequest(root, { url: DETAILS_THREAD_URL(301, 1) })), { ok: true, url: DETAILS_THREAD_URL(301, 1) })
  assert.deepEqual(await host.keepPullRequestComment(detailsRequest(root)), { ok: true, url: DETAILS_THREAD_URL(302, 4) })
  assert.deepEqual(forge.threadWrites().map(({ method, resource, route, sent }) => [method, resource, route.threadId, route.commentId, sent]), [
    ['PATCH', 'pullRequestThreadComments', '301', '1', { content: DETAILS }],
    ['PATCH', 'pullRequestThreadComments', '302', '4', { content: DETAILS }],
  ])
  assert.deepEqual(forge.calls().at(-1), ['devops', 'invoke', '--area=git', '--resource=pullRequestThreadComments', '--route-parameters', 'project=Shop Team', 'repositoryId=payment', 'pullRequestId=42', 'threadId=302', 'commentId=4', '--http-method=PATCH', `--in-file=${join(root, 'pull-request-details-1.comment.json')}`, ...QUIET_THREADS])

  const gone = repository(t, { az: { ...SIGNED_IN, threads: [{ id: 300, comments: [{ id: 1, content: 'a person' }] }] } })
  assert.deepEqual(await gone.codeHost().keepPullRequestComment(detailsRequest(gone.root, { url: DETAILS_THREAD_URL(999, 1) })), { ok: true, url: DETAILS_THREAD_URL(42, 1) }, 'a thread a person deleted is posted again')
  assert.deepEqual(gone.forge.threadWrites().map(({ method }) => method), ['POST'])
})

test('through az, a rewrite answered for another comment than the one rewritten is unreadable: the details are not reported kept at a URL nobody confirmed', async (t) => {
  for (const answer of [{ id: 99 }, { content: 'no id' }, 'not json']) {
    const { root, forge, codeHost } = repository(t, { az: { ...SIGNED_IN, threads: [{ id: 300, comments: [{ id: 1, content: DETAILS }] }], rewriteAnswer: answer } })

    const kept = await codeHost().keepPullRequestComment(detailsRequest(root, { url: DETAILS_THREAD_URL(300, 1) }))

    assert.deepEqual(kept, { ok: false, reason: 'az could not comment pull request #42 on Shop Team/payment' }, JSON.stringify(answer))
    assert.deepEqual(forge.threadWrites().map(({ method }) => method), ['PATCH'], JSON.stringify(answer))
  }
})

test('through az, a thread that quotes the marker without starting with it, or whose first comment was deleted, is someone else\'s: never rewritten, the run posts its own', async (t) => {
  const threads = [{ id: 300, comments: [{ id: 1, content: `> ${DETAILS_MARKER}\nI disagree` }] }, { id: 301, comments: [{ id: 1, content: DETAILS_MARKER, isDeleted: true }, { id: 2, content: 'after' }] }]
  const { root, forge, codeHost } = repository(t, { az: { ...SIGNED_IN, threads } })

  assert.deepEqual(await codeHost().keepPullRequestComment(detailsRequest(root)), { ok: true, url: DETAILS_THREAD_URL(43, 1) })
  assert.deepEqual(forge.threadWrites().map(({ method }) => method), ['POST'])
  assert.deepEqual(forge.threads().slice(0, 2), threads)
})

test('an az that cannot list the threads, fails, or answers what skraft cannot read writes nothing twice, none of what it prints reaches a reason, and one that is not signed in is not asked', async (t) => {
  const listing = 'az could not list the comment threads of pull request #42 on Shop Team/payment'
  const commenting = 'az could not comment pull request #42 on Shop Team/payment'
  for (const [state, reason] of [
    [{ unreadableList: true }, listing],
    [{ threadsWithoutValue: true }, listing],
    [{ threads: [{ id: 'one', comments: [] }] }, listing],
    [{ unreadableWrite: true }, commenting],
    [{ commentFails: true }, commenting],
    [{ threads: [{ id: 300, comments: [{ id: 1, content: DETAILS_MARKER }] }], commentFails: true }, commenting],
  ]) {
    const { root, forge, codeHost } = repository(t, { az: { ...SIGNED_IN, ...state } })

    assert.deepEqual(await codeHost().keepPullRequestComment(detailsRequest(root)), { ok: false, reason }, JSON.stringify(state))
    assert.ok(forge.threadWrites().length <= 1, 'never posted twice')
  }

  const signedOut = repository(t, { az: { ...SIGNED_IN, signedIn: false } })
  assert.deepEqual(await signedOut.codeHost().keepPullRequestComment(detailsRequest(signedOut.root)), { ok: false, reason: 'az is not signed in to the Azure DevOps organization https://dev.azure.com/acme, or cannot read Shop Team/payment there; run az login, or az devops login --organization https://dev.azure.com/acme' })
  assert.deepEqual(signedOut.forge.calls().filter((call) => call[0] === 'devops'), [])
  assert.deepEqual(await repository(t, { remote: null }).codeHost().keepPullRequestComment(detailsRequest(signedOut.root)), { ok: false, reason: 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository' })
})

test('Azure DevOps takes 4,000 characters in a description and 140,000 in a comment', async (t) => {
  const { codeHost } = repository(t)

  assert.deepEqual([codeHost().bodyLimit, codeHost().commentLimit], [4_000, 140_000])
})

const PULL = (more = {}) => ({
  pullRequestId: 12, title: 'Discount at checkout', description: 'Applies a 10% discount.',
  sourceRefName: 'refs/heads/discount', targetRefName: 'refs/heads/main',
  lastMergeSourceCommit: { commitId: 'aaa111' }, lastMergeTargetCommit: { commitId: 'bbb222' },
  repository: { name: 'payment', project: { name: 'Shop Team' } },
  url: 'https://dev.azure.com/acme/Shop%20Team/_apis/git/repositories/payment/pullRequests/12',
  ...more,
})
const PULL_12 = { pullRequests: { 12: PULL() } }
const SHOW_12 = ['repos', 'pr', 'show', '--id=12', '--organization=https://dev.azure.com/acme', '--detect=false', '--only-show-errors', '--output=json']
const ON_PULL_12 = ['--area=git', '--resource=pullRequestThreads', '--route-parameters', 'project=Shop Team', 'repositoryId=payment', 'pullRequestId=12']
const GIT_API = ['--api-version=7.1', '--organization=https://dev.azure.com/acme', '--only-show-errors', '--output=json']
const THREAD_URL = (thread, comment = 1) => `https://dev.azure.com/acme/Shop%20Team/_apis/git/repositories/payment/pullRequests/12/threads/${thread}/comments/${comment}`
const REVIEW_MARKER = '<sub>skraft-review pr=12</sub>'
const REVIEW = `### skraft review · #12 — NEEDS_REWORK (pass 1)\n\nNEEDS_REWORK: 1 reason to address\n\n${REVIEW_MARKER}\n`

/** The request a review's comment is kept with: the body, and the two JSON files az sends, as the engine writes them. */
const threadRequest = (root, { url = null, body = REVIEW } = {}) => {
  const threadFile = join(root, 'comment.thread.json')
  const contentFile = join(root, 'comment.content.json')
  writeFileSync(threadFile, JSON.stringify({ comments: [{ parentCommentId: 0, content: body, commentType: 1 }], status: 4 }))
  writeFileSync(contentFile, JSON.stringify({ content: body }))
  return { number: 12, marker: REVIEW_MARKER, url, bodyFile: join(root, 'comment.md'), body, threadFile, contentFile }
}

test('a pull request is read through az repos pr show: title, description, branches and the commits of its last merge, its page built; one az does not find is missing', async (t) => {
  const { forge, createdPullRequests } = pullRequestsOn(t, { az: { ...SIGNED_IN, ...PULL_12 } })
  const pullRequests = createdPullRequests()

  assert.deepEqual(await pullRequests.find(12), {
    ok: true,
    found: {
      number: 12, url: 'https://dev.azure.com/acme/Shop%20Team/_git/payment/pullrequest/12', title: 'Discount at checkout', body: 'Applies a 10% discount.',
      base: { ref: 'main', sha: 'bbb222' }, head: { ref: 'discount', sha: 'aaa111' },
    },
  })
  assert.deepEqual(forge.calls().at(-1), SHOW_12)
  assert.deepEqual(await pullRequests.find(13), { ok: true, found: null })
  forge.set({ pullRequests: { 12: PULL({ description: null }) } })
  assert.equal((await pullRequests.find(12)).found.body, '')
})

test('a pull request az cannot read, or answers in a form skraft cannot read, or of another repository or project, is a fixed reason that holds no output of az', async (t) => {
  const reasons = [
    [{ pullRequestFails: true }, 'az could not read pull request #12 of https://dev.azure.com/acme'],
    [{ pullRequests: { 12: 'not json' } }, 'Azure DevOps answered pull request #12 in a form skraft cannot read'],
    [{ pullRequests: { 12: PULL({ lastMergeSourceCommit: null }) } }, 'Azure DevOps answered pull request #12 in a form skraft cannot read'],
    [{ pullRequests: { 12: PULL({ url: 'https://dev.azure.com/other/_apis/git/pullRequests/12' }) } }, 'Azure DevOps answered pull request #12 in a form skraft cannot read'],
    [{ pullRequests: { 12: PULL({ repository: { name: 'billing', project: { name: 'Shop Team' } } }) } }, 'pull request #12 is not in Shop Team/payment of the Git remote, so skraft does not review it'],
    [{ pullRequests: { 12: PULL({ repository: { name: 'payment', project: { name: 'Other' } } }) } }, 'pull request #12 is not in Shop Team/payment of the Git remote, so skraft does not review it'],
  ]
  for (const [state, reason] of reasons) {
    const { createdPullRequests } = pullRequestsOn(t, { az: { ...SIGNED_IN, pullRequests: {}, ...state } })

    assert.deepEqual(await createdPullRequests().find(12), { ok: false, reason }, JSON.stringify(state))
  }
  assert.deepEqual(await pullRequestsOn(t, { remote: null }).createdPullRequests().find(12), { ok: false, reason: 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository' })
  const cased = pullRequestsOn(t, { az: { ...SIGNED_IN, pullRequests: { 12: PULL({ repository: { name: 'PAYMENT', project: { name: 'shop team' } } }) } } })
  assert.equal((await cased.createdPullRequests().find(12)).ok, true)
})

test('the review\'s thread is posted through az devops invoke, from a JSON file, then its first comment rewritten in place at the URL kept, and found again by its marker without one', async (t) => {
  const { root, forge, createdPullRequests } = pullRequestsOn(t, { az: { ...SIGNED_IN, ...PULL_12 } })
  const pullRequests = createdPullRequests()
  const first = threadRequest(root)

  assert.deepEqual(await pullRequests.keepComment(first), { ok: true, url: THREAD_URL(41) })
  assert.deepEqual(forge.calls().slice(-3), [
    SHOW_12,
    ['devops', 'invoke', ...ON_PULL_12, ...GIT_API],
    ['devops', 'invoke', ...ON_PULL_12, '--http-method=POST', `--in-file=${first.threadFile}`, ...GIT_API],
  ])
  assert.deepEqual(forge.threads().map(({ id, status, comments }) => [id, status, comments[0].content]), [[41, 4, REVIEW]])

  const body = REVIEW.replace('pass 1', 'pass 2')
  const second = threadRequest(root, { url: THREAD_URL(41), body })
  assert.deepEqual(await pullRequests.keepComment(second), { ok: true, url: THREAD_URL(41) })
  assert.deepEqual(forge.calls().at(-1), ['devops', 'invoke', '--area=git', '--resource=pullRequestThreadComments', '--route-parameters', 'project=Shop Team', 'repositoryId=payment', 'pullRequestId=12', 'threadId=41', 'commentId=1', '--http-method=PATCH', `--in-file=${second.contentFile}`, ...GIT_API])
  assert.deepEqual(forge.threads().map(({ comments }) => comments[0].content), [body])

  assert.deepEqual(await pullRequests.keepComment(threadRequest(root, { url: null, body: REVIEW })), { ok: true, url: THREAD_URL(41) }, 'found again by its marker, as the first pass was lost')
  assert.deepEqual(forge.threadWrites().map(({ method, resource }) => [method, resource]), [['POST', 'pullRequestThreads'], ['PATCH', 'pullRequestThreadComments'], ['PATCH', 'pullRequestThreadComments']])
  assert.equal(forge.threads().length, 1)
})

test('a rewrite az answers for another comment than the one rewritten is unreadable: the review is not reported as commented at a URL nobody confirmed', async (t) => {
  const first = { id: 41, comments: [{ id: 1, content: REVIEW }] }
  for (const answer of [{ id: 99 }, { content: 'no id' }, 'not json']) {
    const { root, forge, createdPullRequests } = pullRequestsOn(t, { az: { ...SIGNED_IN, ...PULL_12, threads: [first], rewriteAnswer: answer } })

    const kept = await createdPullRequests().keepComment(threadRequest(root, { url: THREAD_URL(41) }))

    assert.deepEqual(kept, { ok: false, reason: 'az could not comment pull request #12 of Shop Team/payment' }, JSON.stringify(answer))
    assert.deepEqual(forge.threadWrites().map(({ method }) => method), ['PATCH'], JSON.stringify(answer))
  }
})

test('a reply that quotes the review is not rewritten, nor a thread whose comment a person deleted: the review is posted as its own thread', async (t) => {
  const quoting = { id: 5, comments: [{ id: 1, content: `> ${REVIEW}\nno` }] }
  const deleted = { id: 6, comments: [{ id: 1, content: REVIEW, isDeleted: true }] }
  const { root, forge, createdPullRequests } = pullRequestsOn(t, { az: { ...SIGNED_IN, ...PULL_12, threads: [quoting, deleted] } })

  assert.deepEqual(await createdPullRequests().keepComment(threadRequest(root)), { ok: true, url: THREAD_URL(43) })
  assert.deepEqual(forge.threadWrites().map(({ method }) => method), ['POST'])
})

test('through az, a pull request that cannot be read, of another repository, or whose threads cannot be listed, is never written to; a write that fails writes nothing twice; nothing az prints reaches a reason', async (t) => {
  const couldNot = 'az could not comment pull request #12 of Shop Team/payment'
  const cases = [
    [{ pullRequests: {} }, 'az could not read pull request #12 of https://dev.azure.com/acme', 0],
    [{ pullRequests: {}, pullRequestFails: true }, 'az could not read pull request #12 of https://dev.azure.com/acme', 0],
    [{ pullRequests: { 12: PULL({ repository: { name: 'billing', project: { name: 'Shop Team' } } }) } }, 'pull request #12 is not in Shop Team/payment of the Git remote, so skraft does not review it', 0],
    [{ unreadableList: true }, couldNot, 0],
    [{ threads: [{ id: 'five', comments: [] }] }, couldNot, 0],
    [{ threads: [{ id: 5, comments: [{ id: 1, content: 'a person' }] }], threadCount: 2 }, couldNot, 0],
    [{ unreadableWrite: true }, couldNot, 1],
    [{ commentFails: true }, couldNot, 1],
  ]
  for (const [state, reason, writes] of cases) {
    const { root, forge, createdPullRequests } = pullRequestsOn(t, { az: { ...SIGNED_IN, ...PULL_12, ...state } })

    assert.deepEqual(await createdPullRequests().keepComment(threadRequest(root)), { ok: false, reason }, JSON.stringify(state))
    assert.equal(forge.threadWrites().length, writes, JSON.stringify(state))
  }
  assert.deepEqual(await pullRequestsOn(t, { remote: null }).createdPullRequests().keepComment({ number: 12, marker: REVIEW_MARKER, url: null, bodyFile: '', body: '', threadFile: '', contentFile: '' }), { ok: false, reason: 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository' })
})

test('through az, a push is read back by git ls-remote, a write az got no answer for is unknown, and a work item comment or a thread comment is read back at the REST address skraft built', async (t) => {
  const { root, cwd, forge, codeHost } = repository(t, { az: { ...SIGNED_IN, workItems: { 42: { id: 42, fields: { 'System.TeamProject': 'Shop Team', 'System.WorkItemType': 'User Story', 'System.Title': 'Pay' } } } } })
  const host = codeHost()
  const tip = git(cwd, 'rev-parse', 'HEAD')

  assert.equal(await host.localTip('checkout'), tip)
  assert.deepEqual(await host.push('checkout'), { ok: true })
  assert.deepEqual(await host.remoteTip('checkout'), { ok: true, sha: tip })
  assert.deepEqual(await repository(t, { remote: null }).codeHost().remoteTip('checkout'), { ok: false, reason: 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository' })

  const bodyFile = join(root, 'body.md')
  const requestFile = join(root, 'request.json')
  const marker = '<!-- skraft:issue-progress slug=checkout -->'
  writeFileSync(bodyFile, `${marker}\nRESEARCH closed\n`)
  writeFileSync(requestFile, JSON.stringify({ text: `${marker}\nRESEARCH closed\n` }))
  // A cut is an az that never answers: the runner's time limit stops it, the one way a write goes
  // unanswered on every OS. The limit stands for the adapter's 120 s.
  forge.set({ ...SIGNED_IN, workItems: { 42: { id: 42, fields: { 'System.TeamProject': 'Shop Team' } } }, cut: true })
  const cut = createAzCodeHost({ commandRunner: shortLimit(createNodeCommandRunner({ root: cwd, env: { ...envWithPath([forge.path, ...toolFolders()]), ...forge.env } })) })
  assert.deepEqual(await cut.create({ base: 'main', head: 'checkout', title: 'Pay', bodyFile, draft: true, issue: null }), { ok: false, reason: 'az could not open the pull request of checkout on Shop Team/payment', outcome: 'unknown' })
  assert.deepEqual(await cut.edit({ number: 7, bodyFile }), { ok: false, reason: 'az could not update pull request #7 on Shop Team/payment', outcome: 'unknown' })
  assert.deepEqual(await cut.keepIssueComment({ number: 42, marker, url: null, bodyFile, requestFile, body: '' }), { ok: false, reason: 'az could not comment work item #42 of Shop Team', outcome: 'unknown' })

  forge.set({ ...SIGNED_IN, workItems: { 42: { id: 42, fields: { 'System.TeamProject': 'Shop Team' } } } })
  const kept = await host.keepIssueComment({ number: 42, marker, url: null, bodyFile, requestFile, body: '' })
  assert.deepEqual(await host.readComment(kept.url), { ok: true, body: `${marker}\nRESEARCH closed\n` })
  assert.deepEqual(forge.calls().at(-1), ['az', 'devops', 'invoke', '--area=wit', '--resource=comments', '--route-parameters', 'project=Shop Team', 'workItemId=42', `commentId=${kept.url.split('/').at(-1)}`, '--api-version=7.2-preview.4', '--organization=https://dev.azure.com/acme', '--only-show-errors', '--output=json'].slice(1))

  const threadFile = join(root, 'thread.json')
  writeFileSync(threadFile, JSON.stringify({ comments: [{ parentCommentId: 0, content: '&lt;!-- skraft:run-details slug=checkout part=1 --&gt;\ndetails', commentType: 1 }], status: 4 }))
  const thread = await host.keepPullRequestComment({ number: 7, marker: '<!-- skraft:run-details slug=checkout part=1 -->', url: null, bodyFile, body: '', threadFile, commentFile: '' })
  assert.deepEqual(await host.readComment(thread.url), { ok: true, body: '<!-- skraft:run-details slug=checkout part=1 -->\ndetails' }, 'read as written, its entities decoded')

  assert.deepEqual(await host.readComment(thread.url.replace('acme', 'other')), { ok: false, reason: `${thread.url.replace('acme', 'other')} names no comment of Shop Team/payment` })
  assert.deepEqual(await host.readComment(thread.url.replace(/comments\/\d+$/, 'comments/99')), { ok: false, reason: `az could not read back the comment at ${thread.url.replace(/comments\/\d+$/, 'comments/99')}` })
  assert.deepEqual(await host.readComment('https://dev.azure.com/acme/somewhere'), { ok: false, reason: 'https://dev.azure.com/acme/somewhere names no comment of Shop Team/payment' })
  assert.deepEqual(await repository(t, { remote: null }).codeHost().readComment(kept.url), { ok: false, reason: 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository' })
  assert.ok(!JSON.stringify(forge.calls()).includes('SECRET'), 'nothing az prints reaches a reason')
})

test('a pull request the run opened is read back by its number through az repos pr show, its description whole past the 400 characters a listing keeps; a fork\'s is told, another repository\'s refused', async (t) => {
  const description = `${'Checkout takes a card payment. '.repeat(30)}End.`
  const pull = { pullRequestId: 7, status: 'active', description, sourceRefName: 'refs/heads/checkout', repository: { name: 'payment' } }
  const { forge, codeHost } = repository(t, { az: { ...SIGNED_IN, pulls: [{ ...pull, description: description.slice(0, 400) }], pullRequests: { 7: pull, 8: { ...pull, pullRequestId: 8, forkSource: { repository: { name: 'payment' } } }, 9: { ...pull, pullRequestId: 9, repository: { name: 'other' } }, 10: { pullRequestId: 10 }, 12: pull, 13: { ...pull, pullRequestId: 13, sourceRefName: 42 }, 14: { ...pull, pullRequestId: 14, description: 42 } } } })
  const host = codeHost()

  assert.equal((await host.findPullRequest('checkout')).found.body.length, 400, 'a listing cuts the description')
  assert.deepEqual(await host.readPullRequest(7), { ok: true, found: { number: 7, url: 'https://dev.azure.com/acme/Shop%20Team/_git/payment/pullrequest/7', state: 'open', body: description, head: 'checkout', fromFork: false } })
  assert.deepEqual(forge.calls().at(-1), ['repos', 'pr', 'show', '--id=7', '--organization=https://dev.azure.com/acme', '--detect=false', '--only-show-errors', '--output=json'])
  assert.equal((await host.readPullRequest(8)).found.fromFork, true)
  const unreadable = (number) => ({ ok: false, reason: `Azure DevOps answered pull request #${number} in a form skraft cannot read, or of another repository than Shop Team/payment` })
  assert.deepEqual(await host.readPullRequest(9), unreadable(9))
  assert.deepEqual(await host.readPullRequest(10), unreadable(10))
  assert.deepEqual(await host.readPullRequest(12), unreadable(12), 'an answer for another pull request than the one asked')
  assert.deepEqual(await host.readPullRequest(13), unreadable(13), 'no source branch')
  assert.deepEqual(await host.readPullRequest(14), unreadable(14), 'a description that is not text')
  assert.deepEqual(await host.readPullRequest(11), { ok: true, found: null })
  forge.set({ ...SIGNED_IN, pullRequests: {}, pullRequestFails: true })
  assert.deepEqual(await host.readPullRequest(7), { ok: false, reason: 'az could not read pull request #7 of https://dev.azure.com/acme' })
  assert.deepEqual(await repository(t, { remote: null }).codeHost().readPullRequest(7), { ok: false, reason: 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository' })
})
