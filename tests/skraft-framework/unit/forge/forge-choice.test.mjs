import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit } from '../support/in-memory-host.mjs'
import { nominal, REFS_42, scripted, SLUG } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const UNREACHABLE = 'skraft cannot reach the forge azure-devops yet (forge in skraft-config.json, else the host of the Git remote, chooses it)'
const NOT_OPENED = `pull request not opened: ${UNREACHABLE}; pull-request.md holds its description, and skraft publish opens it once that is fixed`

/** A run from issue 42, consented, whose working copy's remote is at that URL, with more of skraft-config.json. @param {string | null} remote @param {object} [config] */
const runOn = async (remote, config = {}) => {
  const host = scripted({ config: { ...CONSENTED, ...config }, git: new InMemoryGit({ remote }) }, (it) => nominal(it, REFS_42))
  const initialised = await host.init(STORY)
  return { host, initialised, outcome: await host.run() }
}

test('a remote on Azure DevOps chooses that forge, which skraft cannot reach yet: the run starts without the body of its issue, keeps nothing on it, opens no pull request, and asks gh nothing', async () => {
  const remotes = [
    'https://dev.azure.com/acme/shop/_git/shop',
    'https://acme@Dev.Azure.com/acme/shop/_git/shop',
    'git@ssh.dev.azure.com:v3/acme/shop/shop',
    'ssh://git@ssh.dev.azure.com:22/v3/acme/shop/shop',
    'https://acme.visualstudio.com/shop/_git/shop',
    'acme@vs-ssh.visualstudio.com:v3/acme/shop/shop',
  ]
  for (const remote of remotes) {
    const { host, initialised, outcome } = await runOn(remote)

    assert.equal(initialised.reason, `${SLUG} is the active pipeline; the body of issue #42 was not read (${UNREACHABLE}): its agents get its number and title only`, remote)
    assert.deepEqual([outcome.status, eventsOf(host, 'step.recorded').at(-1).reason], ['done', NOT_OPENED], remote)
    assert.ok((await host.tracking.read(SLUG, 'pull-request.md')).startsWith('Pay by card at checkout\n\n## What changes\n'), 'no forge writes the line that links it to its story')
    const skipped = eventsOf(host, 'issue.comment-skipped')
    assert.deepEqual([skipped.length > 0, [...new Set(skipped.map(({ reason }) => reason))], eventsOf(host, 'issue.commented')], [true, [UNREACHABLE], []], remote)
    assert.deepEqual([host.codeHost.issuesRead, host.codeHost.calls], [[], []], remote)
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
  assert.equal(eventsOf(azure.host, 'step.recorded').at(-1).reason, NOT_OPENED)
  assert.deepEqual([azure.host.codeHost.issuesRead, azure.host.codeHost.calls], [[], []])
})
