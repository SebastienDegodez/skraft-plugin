import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit } from '../support/in-memory-host.mjs'
import { nominal, REFS_42, scripted, SLUG } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const UNREACHABLE = 'skraft cannot reach the forge azure-devops yet (forge in skraft-config.json, else the host of the Git remote, chooses it)'
const NOT_OPENED = `pull request not opened: ${UNREACHABLE}; pull-request.md holds its description, and skraft publish opens it once that is fixed`

const NO_ISSUE_READ = `issue #42 could not be read (${UNREACHABLE}); make the forge readable, or start the run without an issue`

/** A run, from issue 42 unless told otherwise, consented, whose working copy's remote is at that URL, with more of skraft-config.json. @param {string | null} remote @param {object} [config] @param {object} [request] */
const runOn = async (remote, config = {}, request = STORY) => {
  const host = scripted({ config: { ...CONSENTED, ...config }, git: new InMemoryGit({ remote }) }, (it) => nominal(it, request.story ? REFS_42 : ''))
  const initialised = await host.init(request)
  return { host, initialised, outcome: initialised.ok ? await host.run() : null }
}

test('a remote on Azure DevOps chooses that forge, which this host cannot reach: a run from an issue is refused with the reason, and one without an issue opens no pull request; gh is asked nothing', async () => {
  const remotes = [
    'https://dev.azure.com/acme/shop/_git/shop',
    'https://acme@Dev.Azure.com/acme/shop/_git/shop',
    'git@ssh.dev.azure.com:v3/acme/shop/shop',
    'ssh://git@ssh.dev.azure.com:22/v3/acme/shop/shop',
    'https://acme.visualstudio.com/shop/_git/shop',
    'acme@vs-ssh.visualstudio.com:v3/acme/shop/shop',
  ]
  for (const remote of remotes) {
    const fromIssue = await runOn(remote)
    const alone = await runOn(remote, {}, {})

    assert.deepEqual([fromIssue.initialised.code, fromIssue.initialised.reason, fromIssue.host.events()], ['issue-unreadable', NO_ISSUE_READ, []], remote)
    assert.deepEqual([alone.outcome.status, eventsOf(alone.host, 'step.recorded').at(-1).reason], ['done', NOT_OPENED], remote)
    assert.ok((await alone.host.tracking.read(SLUG, 'pull-request.md')).startsWith('Pay by card at checkout\n\n## What changes\n'), 'no forge writes the line that links it to its story')
    assert.deepEqual([fromIssue.host.codeHost.issuesRead, fromIssue.host.codeHost.calls, alone.host.codeHost.calls], [[], [], []], remote)
  }
})

test('any other remote, or none, chooses GitHub', async () => {
  for (const remote of ['git@github.com:acme/shop.git', 'https://github.example.com/acme/shop.git', 'https://dev.azure.com.example.org/acme/shop.git', 'https://xdev.azure.com/acme/shop.git', 'https://evil-dev.azure.com/acme/shop.git', 'git@visualstudio.com:acme/shop.git', '/srv/git/shop.git', null]) {
    const { host, outcome } = await runOn(remote)

    assert.deepEqual([outcome.status, eventsOf(host, 'step.recorded').at(-1).reason], ['done', 'pull request #42 opened as a draft: https://github.example.com/acme/shop/pull/42'], String(remote))
    assert.deepEqual(host.codeHost.issuesRead, [42], String(remote))
  }
})

test('the forge skraft-config.json names wins over the one the remote names', async () => {
  const github = await runOn('https://dev.azure.com/acme/shop/_git/shop', { forge: 'github' })
  assert.equal(eventsOf(github.host, 'step.recorded').at(-1).reason, 'pull request #42 opened as a draft: https://github.example.com/acme/shop/pull/42')
  assert.deepEqual(github.host.codeHost.issuesRead, [42])

  const azure = await runOn('git@github.com:acme/shop.git', { forge: 'azure-devops' })
  assert.deepEqual([azure.initialised.code, azure.initialised.reason], ['issue-unreadable', NO_ISSUE_READ])
  const alone = await runOn('git@github.com:acme/shop.git', { forge: 'azure-devops' }, {})
  assert.equal(eventsOf(alone.host, 'step.recorded').at(-1).reason, NOT_OPENED)
  assert.deepEqual([azure.host.codeHost.issuesRead, azure.host.codeHost.calls, alone.host.codeHost.calls], [[], [], []])
})
