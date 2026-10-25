import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { createGhCodeHost } from '../../../../plugins/skraft-framework/engine/infrastructure/code-host/gh-code-host.mjs'
import { createNodeCommandRunner } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { commitAll, envWithPath, git, tempFolder, toolFolders } from '../support/workspace.mjs'

// gh stands for the forge, which no test reaches: a script that keeps each argv it is given
// and answers from gh-state.json. git is real, its remote a bare repository on disk.
const FAKE_GH = [
  "import { appendFileSync, readFileSync } from 'node:fs'",
  "import { dirname, join } from 'node:path'",
  "import { fileURLToPath } from 'node:url'",
  'const here = dirname(fileURLToPath(import.meta.url))',
  'const args = process.argv.slice(2)',
  "appendFileSync(join(here, 'gh-calls.jsonl'), `${JSON.stringify(args)}\\n`)",
  "const state = JSON.parse(readFileSync(join(here, 'gh-state.json'), 'utf8'))",
  "const said = (text, code = 0) => { process.stdout.write(`${text}\\n`); process.exit(code) }",
  "if (state.fails) { process.stderr.write('SECRET-STDERR\\n'); process.exit(1) }",
  "if (args[0] === '--version') said('gh version 2.62.0')",
  "if (args[0] === 'auth') process.exit(state.signedIn ? 0 : 1)",
  "if (args[0] === 'repo') said(state.defaultBranch)",
  "if (args[1] === 'list') said(typeof state.open === 'string' ? state.open : JSON.stringify(state.open))",
  "if (args[1] === 'create') said(`Creating pull request\\n${state.created}`)",
  "if (args[1] === 'edit') said(state.created)",
  'process.exit(2)',
  '',
].join('\n')

/** A folder holding the fake gh, for POSIX and for Windows. */
const ghFolder = (root, state) => {
  const bin = join(root, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'gh.mjs'), FAKE_GH)
  writeFileSync(join(bin, 'gh-calls.jsonl'), '')
  writeFileSync(join(bin, 'gh-state.json'), JSON.stringify(state))
  writeFileSync(join(bin, 'gh.cmd'), `@"${process.execPath}" "%~dp0gh.mjs" %*\r\n`)
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${join(bin, 'gh.mjs')}" "$@"\n`)
  chmodSync(join(bin, 'gh'), 0o755)
  return {
    bin,
    calls: () => readFileSync(join(bin, 'gh-calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)),
    set: (more) => writeFileSync(join(bin, 'gh-state.json'), JSON.stringify({ ...state, ...more })),
  }
}

/**
 * A folder holding git alone, which runs the machine's and keeps, one line per call, how it was
 * told to prompt: a PATH without any gh the machine has.
 */
const gitAlone = (root) => {
  const real = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim()
  const bin = join(root, 'git-only')
  const log = join(bin, 'prompts.log')
  mkdirSync(bin, { recursive: true })
  writeFileSync(log, '')
  writeFileSync(join(bin, 'git.cmd'), `@echo %GIT_TERMINAL_PROMPT%;%GIT_SSH_COMMAND%>>"${log}"\r\n@"${real}" %*\r\n`)
  writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$GIT_TERMINAL_PROMPT;$GIT_SSH_COMMAND" >> "${log}"\nexec "${real}" "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755)
  return bin
}

/**
 * A working copy on the branch checkout, one commit ahead of main, its origin a GitHub URL that
 * fetches nothing and pushes to a bare repository beside it.
 */
const repository = (t, { remote = 'https://github.example.com/acme/payment.git', gh = { signedIn: true, defaultBranch: 'main', open: [], created: 'https://github.example.com/acme/payment/pull/7' } } = {}) => {
  const root = tempFolder(t, 'skraft-code-host-')
  const cwd = join(root, 'payment')
  mkdirSync(cwd)
  writeFileSync(join(cwd, 'README.md'), '# payment\n')
  commitAll(cwd)
  git(cwd, 'branch', '-M', 'main')
  git(cwd, 'checkout', '-q', '-b', 'checkout')
  writeFileSync(join(cwd, 'pay.mjs'), 'export const pay = () => true\n')
  commitAll(cwd, 'feat: pay')
  git(root, 'init', '-q', '--bare', 'remote.git')
  if (remote !== null) {
    git(cwd, 'remote', 'add', 'origin', remote)
    git(cwd, 'config', 'remote.origin.pushurl', join(root, 'remote.git'))
  }
  const forge = ghFolder(root, gh)
  const codeHost = (folders = [forge.bin, ...toolFolders()]) => createGhCodeHost({ commandRunner: createNodeCommandRunner({ root: cwd, env: envWithPath(folders) }) })
  return { root, cwd, forge, codeHost, withoutGh: () => codeHost([gitAlone(root)]), gitLogged: () => codeHost([gitAlone(root), forge.bin, ...toolFolders()]) }
}

test('a pull request can be opened once the working copy has a remote naming a forge, gh is installed and signed in to that host', async (t) => {
  assert.equal(await repository(t, { remote: null }).codeHost().unavailable(), 'the working copy has no Git remote whose URL names a host and a repository')
  assert.equal(await repository(t, { remote: '../elsewhere.git' }).codeHost().unavailable(), 'the working copy has no Git remote whose URL names a host and a repository')

  const { forge, codeHost, withoutGh } = repository(t)
  assert.equal(await withoutGh().unavailable(), 'gh, the GitHub CLI, is not installed')
  forge.set({ signedIn: false })
  assert.equal(await codeHost().unavailable(), 'gh is not signed in to github.example.com; run gh auth login --hostname github.example.com')
  forge.set({ signedIn: true })
  assert.equal(await codeHost().unavailable(), null)
  assert.deepEqual(forge.calls().filter(([command]) => command === 'auth'), [['auth', 'status', '--hostname=github.example.com'], ['auth', 'status', '--hostname=github.example.com']])

  const enterprise = repository(t, { remote: 'git@ghe.acme.io:payments/payment.git' })
  git(enterprise.cwd, 'remote', 'add', 'archive', '../archive.git')
  assert.equal(await enterprise.codeHost().unavailable(), null)
  assert.deepEqual(enterprise.forge.calls().at(-1), ['auth', 'status', '--hostname=ghe.acme.io'])
  assert.deepEqual(await enterprise.codeHost().repository(), { host: 'ghe.acme.io', repository: 'payments/payment' })
  const ssh = repository(t, { remote: 'ssh://git@ghe.acme.io:2222/payments/payment' })
  assert.deepEqual(await ssh.codeHost().repository(), { host: 'ghe.acme.io', repository: 'payments/payment' })
  assert.equal(await ssh.codeHost().defaultBranch(), 'main')
  assert.deepEqual(ssh.forge.calls().at(-1), ['repo', 'view', 'ghe.acme.io/payments/payment', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'])
})

test('the branch HEAD is on is pushed to the same branch of the remote, never forced, never prompting, and is null once HEAD is detached', async (t) => {
  const { root, cwd, gitLogged } = repository(t)
  const host = gitLogged()

  assert.deepEqual(await host.remotes(), ['origin'])
  assert.deepEqual(await host.repository(), { host: 'github.example.com', repository: 'acme/payment' })
  assert.equal(await host.currentBranch(), 'checkout')
  assert.deepEqual(await host.push('checkout'), { ok: true })
  assert.deepEqual([...new Set(readFileSync(join(root, 'git-only', 'prompts.log'), 'utf8').split(/\r?\n/).filter(Boolean))], ['0;ssh -o BatchMode=yes'])
  assert.equal(git(root, '--git-dir', join(root, 'remote.git'), 'rev-parse', 'refs/heads/checkout'), git(cwd, 'rev-parse', 'HEAD'))

  git(cwd, 'reset', '-q', '--hard', 'main')
  writeFileSync(join(cwd, 'pay.mjs'), 'export const pay = () => false\n')
  commitAll(cwd, 'feat: pay otherwise')
  assert.deepEqual(await host.push('checkout'), { ok: false, reason: 'git push of checkout to origin failed or was refused' })

  git(cwd, 'checkout', '-q', '--detach')
  assert.equal(await host.currentBranch(), null)
})

test('the pull request is opened with its body from a file, then found by its head and its body replaced; gh\'s output never reaches a reason', async (t) => {
  const { root, forge, codeHost } = repository(t)
  const host = codeHost()
  const bodyFile = join(root, 'body.md')

  assert.deepEqual(await host.findPullRequest('checkout'), { ok: true, found: null })
  assert.deepEqual(await host.create({ base: 'main', head: 'checkout', title: '-x Pay by card', bodyFile, draft: true }), { ok: true, number: 7, url: 'https://github.example.com/acme/payment/pull/7' })
  await host.create({ base: 'main', head: 'checkout', title: 'Pay by card', bodyFile, draft: false })
  forge.set({ open: [{ number: 7, url: 'https://github.example.com/acme/payment/pull/7', state: 'MERGED', body: 'Paid.\r\n', title: 'Pay by card' }] })
  assert.deepEqual(await host.findPullRequest('checkout'), { ok: true, found: { number: 7, url: 'https://github.example.com/acme/payment/pull/7', state: 'merged', body: 'Paid.\r\n' } })
  assert.deepEqual(await host.edit({ number: 7, bodyFile }), { ok: true })
  assert.deepEqual(forge.calls().filter(([command]) => command === 'pr'), [
    ['pr', 'list', '--repo=github.example.com/acme/payment', '--head=checkout', '--state=all', '--json=number,url,state,body', '--limit=1'],
    ['pr', 'create', '--repo=github.example.com/acme/payment', '--base=main', '--head=checkout', '--title=-x Pay by card', `--body-file=${bodyFile}`, '--draft'],
    ['pr', 'create', '--repo=github.example.com/acme/payment', '--base=main', '--head=checkout', '--title=Pay by card', `--body-file=${bodyFile}`],
    ['pr', 'list', '--repo=github.example.com/acme/payment', '--head=checkout', '--state=all', '--json=number,url,state,body', '--limit=1'],
    ['pr', 'edit', '7', '--repo=github.example.com/acme/payment', `--body-file=${bodyFile}`],
  ])

  forge.set({ open: 'Not JSON at all' })
  assert.deepEqual(await host.findPullRequest('checkout'), { ok: false, reason: 'gh could not list the pull requests of github.example.com/acme/payment' })
  forge.set({ open: { number: 7 } })
  assert.deepEqual(await host.findPullRequest('checkout'), { ok: false, reason: 'gh could not list the pull requests of github.example.com/acme/payment' })
  forge.set({ fails: true })
  assert.deepEqual(await host.findPullRequest('checkout'), { ok: false, reason: 'gh could not list the pull requests of github.example.com/acme/payment' })
  assert.deepEqual(await host.create({ base: 'main', head: 'checkout', title: 'Pay by card', bodyFile, draft: true }), { ok: false, reason: 'gh could not open the pull request of checkout on github.example.com/acme/payment' })
  assert.deepEqual(await host.edit({ number: 7, bodyFile }), { ok: false, reason: 'gh could not update pull request #7 on github.example.com/acme/payment' })
  assert.equal(await host.defaultBranch(), null)
})

test('without a remote, no push, no listing, no pull request is attempted', async (t) => {
  const { forge, codeHost } = repository(t, { remote: null })
  const host = codeHost()
  const refused = { ok: false, reason: 'the working copy has no Git remote whose URL names a host and a repository' }

  assert.deepEqual(await host.push('checkout'), refused)
  assert.deepEqual(await host.findPullRequest('checkout'), refused)
  assert.deepEqual(await host.create({ base: 'main', head: 'checkout', title: 'Pay', bodyFile: 'body.md', draft: true }), refused)
  assert.deepEqual(await host.edit({ number: 7, bodyFile: 'body.md' }), refused)
  assert.equal(await host.defaultBranch(), null)
  assert.equal(await host.repository(), null)
  assert.deepEqual(forge.calls(), [])

  const outside = tempFolder(t, 'skraft-no-repository-')
  const nowhere = createGhCodeHost({ commandRunner: createNodeCommandRunner({ root: outside, env: envWithPath(toolFolders()) }) })
  assert.equal(await nowhere.unavailable(), 'the working copy has no Git remote whose URL names a host and a repository')
  assert.equal(await nowhere.currentBranch(), null)
})
