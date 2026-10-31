import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { createGhCodeHost, createGhPullRequests } from '../../../../plugins/skraft-framework/engine/infrastructure/code-host/gh-code-host.mjs'
import { createNodeCommandRunner } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { commitAll, envWithPath, git, tempFolder, toolFolders } from '../support/workspace.mjs'

// gh stands for the forge, which no test reaches: a script that keeps each argv it is given
// and answers from gh-state.json. git is real, its remote a bare repository on disk.
const FAKE_GH = [
  "import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'",
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
  "if (args[1] === 'set-default') { if (state.defaultRepo) said(state.defaultRepo); process.stderr.write('no default repository has been set\\n'); process.exit(1) }",
  "if (args[0] === 'repo') said(state.defaultBranch)",
  "if (args[1] === 'list') said(typeof state.open === 'string' ? state.open : JSON.stringify(state.open))",
  "if (args[1] === 'create') said(`Creating pull request\\n${state.created}`)",
  "if (args[1] === 'edit') said(state.created)",
  "if (args[0] === 'issue' && state.issue === undefined) { process.stderr.write(`GraphQL: Could not resolve to an issue or pull request with the number of ${args[2]}. (repository.issue)\\n`); process.exit(1) }",
  "if (args[0] === 'issue' && state.issueFails) { process.stderr.write('SECRET-STDERR\\n'); process.exit(1) }",
  "if (args[0] === 'issue') said(typeof state.issue === 'string' ? state.issue : JSON.stringify(state.issue))",
  "if (args[1] === 'view' && state.pull === undefined) { process.stderr.write(`GraphQL: Could not resolve to a PullRequest with the number of ${args[2]}. (repository.pullRequest)\\n`); process.exit(1) }",
  "if (args[1] === 'view') said(typeof state.pull === 'string' ? state.pull : JSON.stringify(state.pull))",
  "if (args[0] === 'api') {",
  "  const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)",
  "  const path = args.at(-1)",
  "  if (path === 'user') said(state.login)",
  "  if (state.printed !== undefined && option('method')) said(state.printed)",
  "  if (state.patchFails && option('method') === 'PATCH') { process.stderr.write('gh: Server Error (HTTP 500)\\n'); process.exit(1) }",
  "  if (state.patchForbidden && option('method') === 'PATCH') { process.stderr.write('gh: Forbidden (HTTP 403)\\n'); process.exit(1) }",
  "  if (state.listFails && option('paginate') === undefined && args.includes('--paginate')) process.exit(1)",
  "  const host = option('hostname')",
  "  const save = () => writeFileSync(join(here, 'gh-state.json'), JSON.stringify(state))",
  "  const urlOf = (number, id) => `https://${host}/${path.split('/').slice(1, 3).join('/')}/issues/${number}#issuecomment-${id}`",
  "  const edited = /\\/issues\\/comments\\/(\\d+)$/.exec(path)",
  "  if (edited && option('method') === undefined) {",
  "    const comment = state.comments.find((one) => one.id === Number(edited[1])) ?? (state.printed === undefined ? undefined : { login: state.login, number: 42 })",
  "    if (!comment) { process.stderr.write('gh: Not Found (HTTP 404)\\n'); process.exit(1) }",
  "    said(JSON.stringify({ user: { login: comment.login }, issue_url: `https://api.${host}/repos/${path.split('/').slice(1, 3).join('/')}/issues/${comment.number}` }))",
  "  }",
  "  if (edited) {",
  "    const comment = state.comments.find((one) => one.id === Number(edited[1]) && one.login === state.login)",
  "    if (!comment) { process.stderr.write('gh: Not Found (HTTP 404)\\n'); process.exit(1) }",
  "    comment.body = readFileSync(option('field').slice('body=@'.length), 'utf8'); save(); said(urlOf(comment.number, comment.id))",
  "  }",
  "  const number = Number(/\\/issues\\/(\\d+)\\/comments$/.exec(path)[1])",
  "  if (option('method') === 'POST') {",
  "    const id = Math.max(900, ...state.comments.map((one) => one.id)) + 1",
  "    state.comments.push({ id, number, login: state.login, body: readFileSync(option('field').slice('body=@'.length), 'utf8') }); save(); said(urlOf(number, id))",
  "  }",
  "  if (state.listed !== undefined) said(state.listed)",
  "  said(state.comments.filter((one) => one.number === number).map((one) => JSON.stringify({ user: one.login === undefined ? null : { login: one.login }, body: one.body, html_url: urlOf(number, one.id) })).join('\\n'))",
  "}",
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
const repository = (t, { remote = 'https://github.example.com/acme/payment.git', gh = { signedIn: true, defaultBranch: 'main', open: [], created: 'https://github.example.com/acme/payment/pull/7', login: 'sebastien', comments: [] } } = {}) => {
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
  const pullRequests = (folders = [forge.bin, ...toolFolders()]) => createGhPullRequests({ commandRunner: createNodeCommandRunner({ root: cwd, env: envWithPath(folders) }) })
  return { root, cwd, forge, codeHost, pullRequests, withoutGh: () => codeHost([gitAlone(root)]), gitLogged: () => codeHost([gitAlone(root), forge.bin, ...toolFolders()]) }
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

test('a pull request links its story\'s issue as GitHub reads it: closed by a pull request into the default branch, referenced by any other', (t) => {
  const { codeHost } = repository(t)

  assert.equal(codeHost().storyLink(42, true), 'Closes #42')
  assert.equal(codeHost().storyLink(7, false), 'Refs #7')
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

test('the run\'s comment is kept on an issue, or the pull request its number names, of the forge the remote names: posted once, then rewritten by its URL, found again by its marker among the user\'s own comments, posted again once deleted; gh\'s output never reaches a reason', async (t) => {
  const { root, forge, codeHost } = repository(t, { remote: 'git@ghe.acme.io:payments/payment.git' })
  const host = codeHost()
  const bodyFile = join(root, 'progress.md')
  const marker = '<!-- skraft:issue-progress slug=checkout -->'
  const keep = (url, body) => {
    writeFileSync(bodyFile, `${marker}\n${body}\n`)
    return host.keepIssueComment({ number: 42, marker, url, bodyFile })
  }
  const first = 'https://ghe.acme.io/payments/payment/issues/42#issuecomment-902'
  forge.set({ comments: [{ id: 901, number: 42, login: 'someone-else', body: `${marker}\nnot mine\n` }, { id: 899, number: 42, body: `${marker}\na deleted account's\n` }] })

  assert.deepEqual(await keep(null, 'RESEARCH closed'), { ok: true, url: first })
  assert.deepEqual(forge.calls(), [
    ['api', '--hostname=ghe.acme.io', '--jq=.login', 'user'],
    ['api', '--hostname=ghe.acme.io', '--paginate', '--jq=.[]', 'repos/payments/payment/issues/42/comments'],
    ['api', '--hostname=ghe.acme.io', '--method=POST', `--field=body=@${bodyFile}`, '--jq=.html_url', 'repos/payments/payment/issues/42/comments'],
  ])
  assert.deepEqual(await keep(first, 'DESIGN closed'), { ok: true, url: first })
  assert.deepEqual(forge.calls().at(-1), ['api', '--hostname=ghe.acme.io', '--method=PATCH', `--field=body=@${bodyFile}`, '--jq=.html_url', 'repos/payments/payment/issues/comments/902'])
  assert.deepEqual(await keep(null, 'DISTILL closed'), { ok: true, url: first }, 'a URL the journal lost is found again by the marker')
  const bodies = () => JSON.parse(readFileSync(join(forge.bin, 'gh-state.json'), 'utf8')).comments.map(({ id, body }) => [id, body])
  assert.deepEqual(bodies(), [[901, `${marker}\nnot mine\n`], [899, `${marker}\na deleted account's\n`], [902, `${marker}\nDISTILL closed\n`]])

  forge.set({ comments: [] })
  assert.deepEqual(await keep(first, 'DELIVER closed'), { ok: true, url: 'https://ghe.acme.io/payments/payment/issues/42#issuecomment-901' }, 'a comment a human deleted is posted again')

  forge.set({ fails: true })
  assert.deepEqual(await keep(first, 'run done'), { ok: false, reason: 'gh could not comment issue #42 on ghe.acme.io/payments/payment' })
  assert.equal(forge.calls().filter(([command, , method]) => command === 'api' && method === '--method=POST').length, 2, 'a gh that fails on the kept comment posts no other one')
  forge.set({ fails: false, printed: 'Commented, somewhere' })
  assert.deepEqual(await keep(first, 'run done'), { ok: false, reason: 'gh could not comment issue #42 on ghe.acme.io/payments/payment' }, 'what gh printed is no comment URL')
  for (const printed of [`posted ${first}`, `${first} posted`]) {
    forge.set({ printed })
    assert.deepEqual(await keep(first, 'run done'), { ok: false, reason: 'gh could not comment issue #42 on ghe.acme.io/payments/payment' }, 'a comment URL is all gh prints')
  }
  forge.set({ comments: [{ id: 902, number: 42, login: 'sebastien', body: `${marker}\nDESIGN closed\n` }], patchFails: true })
  assert.deepEqual(await keep(first, 'run done'), { ok: false, reason: 'gh could not comment issue #42 on ghe.acme.io/payments/payment' })
  assert.equal(forge.calls().filter(([command, , method]) => command === 'api' && method === '--method=POST').length, 2, 'a comment the forge could not rewrite is never posted again')
  forge.set({ comments: [{ id: 902, number: 42, login: 'sebastien', body: `${marker}\nDESIGN closed\n` }], patchForbidden: true })
  assert.deepEqual(await keep(null, 'run done'), { ok: false, reason: 'gh could not comment issue #42 on ghe.acme.io/payments/payment' })
  assert.equal(forge.calls().filter(([command, , method]) => command === 'api' && method === '--method=POST').length, 2, 'a comment found by its marker that the forge refuses to rewrite gets no second one beside it')
  forge.set({ comments: [], listFails: true })
  assert.deepEqual(await keep(null, 'run done'), { ok: false, reason: 'gh could not comment issue #42 on ghe.acme.io/payments/payment' })
  assert.equal(forge.calls().filter(([command, , method]) => command === 'api' && method === '--method=POST').length, 2, 'comments gh could not list are never posted to')
  forge.set({ login: 'not a login' })
  assert.deepEqual(await keep(null, 'run done'), { ok: false, reason: 'gh could not tell which user is signed in on ghe.acme.io, so the run\'s comment on issue #42 is neither found nor posted' })
  forge.set({ fails: false, listed: 'Not JSON at all' })
  assert.deepEqual(await keep(null, 'run done'), { ok: false, reason: 'gh could not comment issue #42 on ghe.acme.io/payments/payment' }, 'a listing gh printed unreadably posts no second comment')
  assert.equal(forge.calls().filter(([command, , method]) => command === 'api' && method === '--method=POST').length, 2)
})

test('without a remote, no push, no listing, no pull request is attempted', async (t) => {
  const { forge, codeHost } = repository(t, { remote: null })
  const host = codeHost()
  const refused = { ok: false, reason: 'the working copy has no Git remote whose URL names a host and a repository' }

  assert.deepEqual(await host.push('checkout'), refused)
  assert.deepEqual(await host.findPullRequest('checkout'), refused)
  assert.deepEqual(await host.create({ base: 'main', head: 'checkout', title: 'Pay', bodyFile: 'body.md', draft: true }), refused)
  assert.deepEqual(await host.edit({ number: 7, bodyFile: 'body.md' }), refused)
  assert.deepEqual(await host.keepIssueComment({ number: 42, marker: 'm', url: null, bodyFile: 'body.md' }), refused)
  assert.deepEqual(await host.issue(42), { read: 'failed', reason: refused.reason })
  assert.equal(await host.defaultBranch(), null)
  assert.equal(await host.repository(), null)
  assert.deepEqual(forge.calls(), [])

  const outside = tempFolder(t, 'skraft-no-repository-')
  const nowhere = createGhCodeHost({ commandRunner: createNodeCommandRunner({ root: outside, env: envWithPath(toolFolders()) }) })
  assert.equal(await nowhere.unavailable(), 'the working copy has no Git remote whose URL names a host and a repository')
  assert.equal(await nowhere.currentBranch(), null)
})

test('a pull request is read by its number with its title, body, base and head; one the forge has not is none; a failure is a fixed reason', async (t) => {
  const { forge, pullRequests } = repository(t)
  const view = { number: 12, url: 'https://github.example.com/acme/payment/pull/12', title: 'Discount', body: 'Applies a discount.', baseRefName: 'main', baseRefOid: 'aaa111', headRefName: 'discount', headRefOid: 'bbb222', author: { login: 'alice' } }

  assert.deepEqual(await pullRequests().find(12), { ok: true, found: null })
  forge.set({ pull: view })
  assert.deepEqual(await pullRequests().find(12), { ok: true, found: {
    number: 12, url: 'https://github.example.com/acme/payment/pull/12', title: 'Discount', body: 'Applies a discount.',
    base: { ref: 'main', sha: 'aaa111' }, head: { ref: 'discount', sha: 'bbb222' },
  } })
  assert.deepEqual(forge.calls().at(-1), ['pr', 'view', '12', '--repo=github.example.com/acme/payment', '--json=number,url,title,body,baseRefName,baseRefOid,headRefName,headRefOid'])
  forge.set({ pull: 'not json' })
  assert.deepEqual(await pullRequests().find(12), { ok: false, reason: 'gh could not read pull request #12 of github.example.com/acme/payment' })
  forge.set({ fails: true })
  assert.deepEqual(await pullRequests().find(12), { ok: false, reason: 'gh could not read pull request #12 of github.example.com/acme/payment' })
})

test('an issue is read by its number with its title and body once gh is signed in to the forge; one the forge has not is missing, a pull request is no issue; a failure is a fixed reason', async (t) => {
  const { forge, codeHost } = repository(t)
  const issue = { number: 42, title: 'Pay by card', url: 'https://github.example.com/acme/payment/issues/42', body: '## Acceptance criteria\n\n- paying 10 answers paid 10\n', author: { login: 'alice' } }
  const unread = { read: 'failed', reason: 'gh could not read issue #42 of github.example.com/acme/payment' }

  assert.deepEqual(await codeHost().issue(42), { read: 'missing' })
  forge.set({ issue })
  assert.deepEqual(await codeHost().issue(42), { read: 'issue', issue: { number: 42, title: 'Pay by card', url: 'https://github.example.com/acme/payment/issues/42', body: '## Acceptance criteria\n\n- paying 10 answers paid 10\n' } })
  assert.deepEqual(forge.calls().at(-1), ['issue', 'view', '42', '--repo=github.example.com/acme/payment', '--json=number,title,url,body'])
  forge.set({ issue: { ...issue, url: 'https://github.example.com/acme/payment/pull/42' } })
  assert.deepEqual(await codeHost().issue(42), { read: 'pull-request' })
  forge.set({ issue: { ...issue, url: 'https://github.example.com/issues/42/pull/42' } })
  assert.deepEqual(await codeHost().issue(42), { read: 'pull-request' }, 'a pull request of a repository whose owner is named issues')
  forge.set({ issue: 'not json' })
  assert.deepEqual(await codeHost().issue(42), unread)
  for (const field of ['title', 'url', 'body']) {
    forge.set({ issue: { ...issue, [field]: null } })
    assert.deepEqual(await codeHost().issue(42), unread, field)
  }
  forge.set({ issue, issueFails: true })
  assert.deepEqual(await codeHost().issue(42), unread)
  forge.set({ issue, signedIn: false })
  assert.deepEqual(await codeHost().issue(42), { read: 'failed', reason: 'gh is not signed in to github.example.com; run gh auth login --hostname github.example.com' })
  assert.deepEqual(forge.calls().at(-1)[0], 'auth')
})

test('the pull requests tell why none can be read, and keep a review comment as the run keeps an issue comment', async (t) => {
  const { forge, pullRequests, root } = repository(t)

  assert.equal(await pullRequests().unavailable(), null)
  assert.deepEqual(await pullRequests().repository(), { host: 'github.example.com', repository: 'acme/payment' })
  forge.set({ signedIn: false })
  assert.equal(await pullRequests().unavailable(), 'gh is not signed in to github.example.com; run gh auth login --hostname github.example.com')
  forge.set({ signedIn: true })
  const body = join(root, 'comment.md')
  writeFileSync(body, 'verdict\n<sub>skraft-review pr=12</sub>\n')
  const kept = await pullRequests().keepComment({ number: 12, marker: '<sub>skraft-review pr=12</sub>', url: null, bodyFile: body })
  assert.deepEqual(kept, { ok: true, url: 'https://github.example.com/acme/payment/issues/12#issuecomment-901' })
})

test('without a remote no pull request is read', async (t) => {
  const { pullRequests, forge } = repository(t, { remote: null })

  assert.deepEqual(await pullRequests().find(12), { ok: false, reason: 'the working copy has no Git remote whose URL names a host and a repository' })
  assert.deepEqual(forge.calls(), [])
})

test('a kept comment URL is rewritten only when it is the signed-in user\'s comment on that issue; any other is left alone, and the user\'s own is found or posted', async (t) => {
  const { root, forge, pullRequests } = repository(t)
  const bodyFile = join(root, 'comment.md')
  const marker = '<sub>skraft-review pr=12</sub>'
  writeFileSync(bodyFile, `verdict\n${marker}\n`)
  const keep = (url) => pullRequests().keepComment({ number: 12, marker, url, bodyFile })
  forge.set({ comments: [
    { id: 950, number: 12, login: 'alice', body: 'my own review' },
    { id: 951, number: 13, login: 'sebastien', body: 'on another pull request' },
  ] })

  assert.deepEqual(await keep('https://github.example.com/acme/payment/issues/12#issuecomment-950'), { ok: true, url: 'https://github.example.com/acme/payment/issues/12#issuecomment-952' })
  assert.deepEqual(await keep('https://github.example.com/acme/payment/issues/13#issuecomment-951'), { ok: true, url: 'https://github.example.com/acme/payment/issues/12#issuecomment-952' })
  const comments = JSON.parse(readFileSync(join(forge.bin, 'gh-state.json'), 'utf8')).comments
  assert.deepEqual(comments.map(({ id, body }) => [id, body]), [[950, 'my own review'], [951, 'on another pull request'], [952, `verdict\n${marker}\n`]])
  assert.equal(forge.calls().filter((call) => call.includes('--method=PATCH')).length, 1, 'only the user\'s own comment, found by its marker, is rewritten')
})

test('in a clone of a fork, pull requests are read and commented on, and the story\'s issue read, on the repository gh would pick: its default, else upstream, else origin', async (t) => {
  const { cwd, forge, pullRequests, codeHost } = repository(t, { remote: 'https://github.example.com/me/payment.git' })
  forge.set({ pull: { number: 12, url: 'u', title: 't', body: 'b', baseRefName: 'main', baseRefOid: 'a', headRefName: 'h', headRefOid: 'b' } })

  await pullRequests().find(12)
  assert.deepEqual(forge.calls().at(-1).slice(0, 4), ['pr', 'view', '12', '--repo=github.example.com/me/payment'])
  git(cwd, 'remote', 'add', 'upstream', 'https://github.example.com/acme/payment.git')
  await pullRequests().find(12)
  assert.deepEqual(forge.calls().at(-1).slice(0, 4), ['pr', 'view', '12', '--repo=github.example.com/acme/payment'])
  await codeHost().issue(42)
  assert.deepEqual(forge.calls().at(-1).slice(0, 4), ['issue', 'view', '42', '--repo=github.example.com/acme/payment'])
  assert.deepEqual(await pullRequests().repository(), { host: 'github.example.com', repository: 'acme/payment' })
  assert.deepEqual(await codeHost().repository(), { host: 'github.example.com', repository: 'me/payment' }, 'the branch is still pushed to origin')
  forge.set({ defaultRepo: 'payments-org/payment' })
  assert.deepEqual(await pullRequests().repository(), { host: 'github.example.com', repository: 'payments-org/payment' })
  forge.set({ defaultRepo: 'not a repository; rm -rf' })
  assert.deepEqual(await pullRequests().repository(), { host: 'github.example.com', repository: 'acme/payment' })
})

test('the run details are kept on the pull request by the issue comment route, with no request file, and GitHub takes 60,000 characters in a comment', async (t) => {
  const { root, forge, codeHost } = repository(t, { remote: 'git@ghe.acme.io:payments/payment.git' })
  const host = codeHost()
  const bodyFile = join(root, 'details.md')
  const marker = '<!-- skraft:run-details slug=checkout part=1 -->'
  writeFileSync(bodyFile, `${marker}\n# skraft · run details\n`)

  const kept = await host.keepPullRequestComment({ number: 42, marker, url: null, bodyFile, body: '', threadFile: '', commentFile: '' })

  assert.equal(kept.ok, true)
  assert.deepEqual(forge.calls().at(-1), ['api', '--hostname=ghe.acme.io', '--method=POST', `--field=body=@${bodyFile}`, '--jq=.html_url', 'repos/payments/payment/issues/42/comments'])
  assert.deepEqual([host.commentLimit, host.takesRequestFile], [60_000, false])
})
