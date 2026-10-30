import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { createAzCodeHost } from '../../../../plugins/skraft-framework/engine/infrastructure/code-host/az-code-host.mjs'
import { createForges } from '../../../../plugins/skraft-framework/engine/infrastructure/code-host/forges.mjs'
import { createNodeCommandRunner } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { commitAll, envWithPath, git, tempFolder, toolFolders } from '../support/workspace.mjs'

// az stands for Azure DevOps, which no test reaches: a script that keeps each argv it is given
// and answers from az-state.json. git is real, its remote a bare repository on disk.
const FAKE_AZ = [
  "import { appendFileSync, readFileSync } from 'node:fs'",
  "import { dirname, join } from 'node:path'",
  "import { fileURLToPath } from 'node:url'",
  'const here = dirname(fileURLToPath(import.meta.url))',
  'const args = process.argv.slice(2)',
  "appendFileSync(join(here, 'az-calls.jsonl'), `${JSON.stringify(args)}\\n`)",
  "const state = JSON.parse(readFileSync(join(here, 'az-state.json'), 'utf8'))",
  "const said = (value) => { process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value)}\\n`); process.exit(0) }",
  "const option = (name) => args[args.indexOf(`--${name}`) + 1]",
  "if (args[0] === '--version') said('azure-cli 2.67.0')",
  "if (args[0] === 'extension') { if (state.extension) said({ name: 'azure-devops' }); process.stderr.write('SECRET-STDERR\\n'); process.exit(1) }",
  "if (state.fails || !state.signedIn) { process.stderr.write('SECRET-STDERR\\n'); process.exit(1) }",
  "if (args[1] === 'show') said({ name: option('repository'), defaultBranch: state.defaultBranch })",
  "if (args[2] === 'list') said(state.pulls)",
  "if (args[2] === 'create') { appendFileSync(join(here, 'az-bodies.txt'), readFileSync(option('description').slice(1), 'utf8')); said(state.created) }",
  "if (args[2] === 'update') said(state.created)",
  'process.exit(2)',
  '',
].join('\n')

const SIGNED_IN = { extension: true, signedIn: true, defaultBranch: 'refs/heads/main', pulls: [], created: { pullRequestId: 7, status: 'active' } }

/** A folder holding the fake az, for POSIX and for Windows. */
const azFolder = (root, state) => {
  const bin = join(root, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'az.mjs'), FAKE_AZ)
  writeFileSync(join(bin, 'az-calls.jsonl'), '')
  writeFileSync(join(bin, 'az-bodies.txt'), '')
  writeFileSync(join(bin, 'az-state.json'), JSON.stringify(state))
  writeFileSync(join(bin, 'az.cmd'), `@"${process.execPath}" "%~dp0az.mjs" %*\r\n`)
  writeFileSync(join(bin, 'az'), `#!/bin/sh\nexec "${process.execPath}" "${join(bin, 'az.mjs')}" "$@"\n`)
  chmodSync(join(bin, 'az'), 0o755)
  return {
    bin,
    calls: () => readFileSync(join(bin, 'az-calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)),
    bodies: () => readFileSync(join(bin, 'az-bodies.txt'), 'utf8'),
    set: (more) => writeFileSync(join(bin, 'az-state.json'), JSON.stringify({ ...state, ...more })),
  }
}

/** A folder holding git alone, which runs the machine's: a PATH without any az the machine has. */
const gitAlone = (root) => {
  const real = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim()
  const bin = join(root, 'git-only')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'git.cmd'), `@"${real}" %*\r\n`)
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nexec "${real}" "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755)
  return bin
}

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
  const runner = (folders = [forge.bin, ...toolFolders()]) => createNodeCommandRunner({ root: cwd, env: envWithPath(folders) })
  return { root, cwd, forge, codeHost: (folders) => createAzCodeHost({ commandRunner: runner(folders) }), runner, withoutAz: () => createAzCodeHost({ commandRunner: runner([gitAlone(root)]) }) }
}

/** What every call to Azure DevOps names: its organization, project and repository, as JSON, with no question asked. */
const ON_SHOP = ['--organization', 'https://dev.azure.com/acme', '--project', 'Shop Team', '--repository', 'payment', '--detect', 'false', '--only-show-errors', '--output', 'json']

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
  assert.deepEqual(forge.calls().slice(-3), [['--version'], ['extension', 'show', '--name', 'azure-devops', '--only-show-errors', '--output', 'json'], ['repos', 'show', ...ON_SHOP]])
})

test('the organization, project and repository are read from every URL Azure DevOps gives a remote', async (t) => {
  const remotes = {
    'https://dev.azure.com/acme/Shop%20Team/_git/payment': 'https://dev.azure.com/acme',
    'git@ssh.dev.azure.com:v3/acme/Shop%20Team/payment': 'https://dev.azure.com/acme',
    'ssh://git@ssh.dev.azure.com:22/v3/acme/Shop%20Team/payment': 'https://dev.azure.com/acme',
    'https://acme.visualstudio.com/Shop%20Team/_git/payment': 'https://acme.visualstudio.com',
    'https://acme.visualstudio.com/DefaultCollection/Shop%20Team/_git/payment/': 'https://acme.visualstudio.com',
    'acme@vs-ssh.visualstudio.com:v3/acme/Shop%20Team/payment': 'https://acme.visualstudio.com',
  }
  for (const [remote, organization] of Object.entries(remotes)) {
    const { forge, codeHost } = repository(t, { remote })
    assert.equal(await codeHost().defaultBranch(), 'main', remote)
    assert.deepEqual(forge.calls().at(-1), ['repos', 'show', '--organization', organization, ...ON_SHOP.slice(2)], remote)
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
  writeFileSync(bodyFile, 'AB#42\n\n## What changes\n')
  const url = 'https://dev.azure.com/acme/Shop%20Team/_git/payment/pullrequest/7'

  assert.deepEqual(await host.findPullRequest('checkout'), { ok: true, found: null })
  assert.deepEqual(await host.create({ base: 'main', head: 'checkout', title: 'Pay by card', bodyFile, draft: true, issue: 42 }), { ok: true, number: 7, url })
  await host.create({ base: 'main', head: 'checkout', title: 'Pay by card', bodyFile, draft: false, issue: null })
  assert.equal(forge.bodies(), 'AB#42\n\n## What changes\n'.repeat(2))
  for (const [status, state] of [['active', 'open'], ['abandoned', 'closed'], ['completed', 'merged']]) {
    forge.set({ pulls: [{ pullRequestId: 7, status, description: 'Paid.' }] })
    assert.deepEqual(await host.findPullRequest('checkout'), { ok: true, found: { number: 7, url, state, body: 'Paid.' } })
  }
  forge.set({ pulls: [{ pullRequestId: 7, status: 'active' }] })
  assert.deepEqual(await host.findPullRequest('checkout'), { ok: true, found: { number: 7, url, state: 'open', body: '' } }, 'a pull request without a description has an empty body')
  assert.deepEqual(await host.edit({ number: 7, bodyFile }), { ok: true })
  assert.deepEqual(forge.calls().filter(([command]) => command === 'repos').slice(0, 4).concat(forge.calls().slice(-1)), [
    ['repos', 'pr', 'list', '--source-branch', 'refs/heads/checkout', '--status', 'all', '--top', '1', ...ON_SHOP],
    ['repos', 'pr', 'create', '--source-branch', 'checkout', '--target-branch', 'main', '--title', 'Pay by card', '--description', `@${bodyFile}`, '--draft', 'true', '--work-items', '42', ...ON_SHOP],
    ['repos', 'pr', 'create', '--source-branch', 'checkout', '--target-branch', 'main', '--title', 'Pay by card', '--description', `@${bodyFile}`, ...ON_SHOP],
    ['repos', 'pr', 'list', '--source-branch', 'refs/heads/checkout', '--status', 'all', '--top', '1', ...ON_SHOP],
    ['repos', 'pr', 'update', '--id', '7', '--description', `@${bodyFile}`, '--organization', 'https://dev.azure.com/acme', '--detect', 'false', '--only-show-errors', '--output', 'json'],
  ])

  for (const pulls of ['Not JSON at all', { pullRequestId: 7 }]) {
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

test('a pull request links its story\'s work item as Azure Boards reads it; issues, their comments and pull request reviews are not reached on Azure DevOps yet', async (t) => {
  const { forge, runner } = repository(t)
  const { codeHost, pullRequests } = createForges({ commandRunner: runner() })['azure-devops']
  const reason = 'skraft cannot reach the forge azure-devops yet (forge in skraft-config.json, else the host of the Git remote, chooses it)'

  assert.deepEqual([codeHost.storyLink(42, true), codeHost.storyLink(7, false)], ['AB#42', 'AB#7'])
  assert.deepEqual(await codeHost.repository(), null, 'no screenshot link is built for a forge whose raw file URLs skraft does not write')
  assert.deepEqual(await codeHost.issue(42), { read: 'failed', reason })
  assert.deepEqual(await codeHost.keepIssueComment({ number: 42, marker: 'm', url: null, bodyFile: 'f' }), { ok: false, reason })
  assert.deepEqual([await pullRequests.unavailable(), await pullRequests.repository()], [reason, null])
  assert.deepEqual(forge.calls(), [])
})
