import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import assert from 'node:assert/strict'

// az stands for Azure DevOps, which no test reaches: a script that keeps each argv it is given
// and answers from az-state.json. git is real, its remote a bare repository on disk.
export const FAKE_AZ = [
  "import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'",
  "import { dirname, join } from 'node:path'",
  "import { fileURLToPath } from 'node:url'",
  'const here = dirname(fileURLToPath(import.meta.url))',
  'const args = process.argv.slice(2)',
  "appendFileSync(join(here, 'az-calls.jsonl'), `${JSON.stringify(args)}\\n`)",
  "const state = JSON.parse(readFileSync(join(here, 'az-state.json'), 'utf8'))",
  "const said = (value) => { process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value)}\\n`); process.exit(0) }",
  "const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)",
  "if (args[0] === '--version') said('azure-cli 2.67.0')",
  "if (args[0] === 'extension') { if (state.extension) said({ name: 'azure-devops' }); process.stderr.write('SECRET-STDERR\\n'); process.exit(1) }",
  "if (state.fails || !state.signedIn) { process.stderr.write('SECRET-STDERR\\n'); process.exit(1) }",
  "if (state.cut && (args[2] === 'create' || args[2] === 'update' || ['POST', 'PATCH'].includes(option('http-method')))) process.kill(process.pid, 'SIGKILL')",
  "if (args[0] === 'boards') { const item = state.workItems?.[option('id')]; if (item !== undefined) said(item); process.stderr.write(state.workItemFails ? 'SECRET-STDERR\\n' : 'TF401232: SECRET-STDERR\\n'); process.exit(1) }",
  "const kv = (name) => { const at = args.indexOf(`--${name}`); const pairs = []; for (let i = at + 1; at >= 0 && i < args.length && !args[i].startsWith('--'); i += 1) pairs.push(args[i].split(/=(.*)/s).slice(0, 2)); return Object.fromEntries(pairs) }",
  "if (args[0] === 'devops' && args[1] === 'invoke' && option('area') === 'git') {",
  "  const file = join(here, 'az-threads.json'); const threads = JSON.parse(readFileSync(file, 'utf8')); const route = kv('route-parameters'); const method = option('http-method') ?? 'GET'",
  "  if (method === 'GET' && route.commentId) { if (state.readFails) process.exit(1); const comment = threads.find((each) => String(each.id) === route.threadId)?.comments.find((each) => String(each.id) === route.commentId); if (!comment) process.exit(1); said(comment) }",
  "  if (method === 'GET') said(state.unreadableList ? 'not json' : state.threadsWithoutValue ? { count: 0 } : { count: state.threadCount ?? threads.length, value: threads })",
  "  const sent = JSON.parse(readFileSync(option('in-file'), 'utf8'))",
  "  appendFileSync(join(here, 'az-thread-writes.jsonl'), `${JSON.stringify({ method, resource: option('resource'), route, sent })}\\n`)",
  "  if (state.commentFails) { process.stderr.write('SECRET-STDERR\\n'); process.exit(1) }",
  "  if (method === 'POST') { const thread = { id: 41 + threads.length, status: sent.status, comments: [{ id: 1, content: sent.comments[0].content }] }; threads.push(thread); writeFileSync(file, JSON.stringify(threads)); said(state.unreadableWrite ? 'not json' : thread) }",
  "  const thread = threads.find((each) => String(each.id) === route.threadId); const comment = thread.comments.find((each) => String(each.id) === route.commentId); comment.content = sent.content; writeFileSync(file, JSON.stringify(threads)); said(state.rewriteAnswer ?? comment)",
  "}",
  "if (args[0] === 'devops' && args[1] === 'invoke') {",
  "  const file = join(here, 'az-comments.json'); const comments = JSON.parse(readFileSync(file, 'utf8')); const route = kv('route-parameters'); const query = kv('query-parameters'); const method = option('http-method') ?? 'GET'",
  "  if (method === 'GET' && route.commentId) { const comment = comments.find((each) => String(each.id) === route.commentId); if (!comment) process.exit(1); said(comment) }",
  "  if (method === 'GET') { const from = Number(query.continuationToken ?? 0); const size = state.pageSize ?? 100; const listed = { count: comments.length, comments: comments.slice(from, from + size), ...(from + size < comments.length ? { continuationToken: String(from + size) } : {}) }; said(state.unreadableList ? 'not json' : listed) }",
  "  const text = JSON.parse(readFileSync(option('in-file'), 'utf8')).text",
  "  appendFileSync(join(here, 'az-writes.jsonl'), `${JSON.stringify({ method, route, query, text })}\\n`)",
  "  if (state.commentFails) { process.stderr.write('SECRET-STDERR\\n'); process.exit(1) }",
  "  if (method === 'POST') { const comment = { id: 500 + comments.length, text }; comments.push(comment); writeFileSync(file, JSON.stringify(comments)); said(state.unreadableWrite ? 'not json' : comment) }",
  "  const at = comments.findIndex((comment) => String(comment.id) === route.commentId); comments[at].text = text; writeFileSync(file, JSON.stringify(comments)); said(comments[at])",
  "}",
  "if (args[1] === 'pr' && args[2] === 'show') { const pull = state.pullRequests?.[option('id')]; if (pull !== undefined) said(pull); process.stderr.write(state.pullRequestFails ? 'SECRET-STDERR\\n' : 'TF401180: SECRET-STDERR\\n'); process.exit(1) }",
  "if (args[1] === 'show') said({ name: option('repository'), defaultBranch: state.defaultBranch })",
  "if (args[2] === 'list') said(state.pulls)",
  "if (args[2] === 'create' && state.refusedWorkItem && option('work-items')) { process.stderr.write('SECRET-STDERR\\n'); process.exit(1) }",
  "if (args[2] === 'create') { appendFileSync(join(here, 'az-bodies.txt'), readFileSync(option('description').slice(1), 'utf8')); said(state.created) }",
  "if (args[2] === 'update') said(state.created)",
  'process.exit(2)',
  '',
].join('\n')

export const SIGNED_IN = { extension: true, signedIn: true, defaultBranch: 'refs/heads/main', pulls: [], created: { pullRequestId: 7, status: 'active' } }

// Under Windows skraft starts az only as the Azure CLI installer lays it out: `<CLI2>\wbin\az.cmd` beside
// `<CLI2>\python.exe`, run as `python.exe -IBm azure.cli <args>` (process/az-launch.mjs). The fake stands
// there as a real Python's venv whose `azure.cli` package runs the fake az.mjs; one for the whole run.
let installerFolder
const installerWbin = () => {
  if (installerFolder !== undefined) return installerFolder
  const venv = mkdtempSync(join(tmpdir(), 'skraft-az-cli-'))
  process.once('exit', () => rmSync(venv, { recursive: true, force: true }))
  const python = spawnSync('where', ['python'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim()
  assert.equal(spawnSync(python, ['-m', 'venv', venv]).status, 0, 'a Python to stand for the Azure CLI installer\'s')
  const cli = join(venv, 'Lib', 'site-packages', 'azure', 'cli')
  mkdirSync(cli, { recursive: true })
  writeFileSync(join(venv, 'Lib', 'site-packages', 'azure', '__init__.py'), '')
  writeFileSync(join(cli, '__init__.py'), '')
  writeFileSync(join(cli, '__main__.py'), "import os, subprocess, sys\nsys.exit(subprocess.call([os.environ['SKRAFT_FAKE_NODE'], os.environ['SKRAFT_FAKE_AZ'], *sys.argv[1:]]))\n")
  installerFolder = join(venv, 'Scripts', 'wbin')
  mkdirSync(installerFolder)
  writeFileSync(join(installerFolder, 'az.cmd'), '')
  return installerFolder
}

/** A folder holding the fake az, for POSIX and for Windows; path: the PATH folder az is found in. */
export const azFolder = (root, state) => {
  const bin = join(root, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'az.mjs'), FAKE_AZ)
  writeFileSync(join(bin, 'az-calls.jsonl'), '')
  writeFileSync(join(bin, 'az-bodies.txt'), '')
  writeFileSync(join(bin, 'az-comments.json'), JSON.stringify(state.comments ?? []))
  writeFileSync(join(bin, 'az-writes.jsonl'), '')
  writeFileSync(join(bin, 'az-threads.json'), JSON.stringify(state.threads ?? []))
  writeFileSync(join(bin, 'az-thread-writes.jsonl'), '')
  writeFileSync(join(bin, 'az-state.json'), JSON.stringify(state))
  writeFileSync(join(bin, 'az'), `#!/bin/sh\nexec "${process.execPath}" "${join(bin, 'az.mjs')}" "$@"\n`)
  chmodSync(join(bin, 'az'), 0o755)
  return {
    bin,
    path: process.platform === 'win32' ? installerWbin() : bin,
    env: { SKRAFT_FAKE_NODE: process.execPath, SKRAFT_FAKE_AZ: join(bin, 'az.mjs') },
    calls: () => readFileSync(join(bin, 'az-calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)),
    bodies: () => readFileSync(join(bin, 'az-bodies.txt'), 'utf8'),
    writes: () => readFileSync(join(bin, 'az-writes.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)),
    threadWrites: () => readFileSync(join(bin, 'az-thread-writes.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)),
    threads: () => JSON.parse(readFileSync(join(bin, 'az-threads.json'), 'utf8')),
    comments: () => JSON.parse(readFileSync(join(bin, 'az-comments.json'), 'utf8')),
    set: (more) => writeFileSync(join(bin, 'az-state.json'), JSON.stringify({ ...state, ...more })),
  }
}

/** A folder holding git alone, which runs the machine's: a PATH without any az the machine has. */
export const gitAlone = (root) => {
  const real = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim()
  const bin = join(root, 'git-only')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'git.cmd'), `@"${real}" %*\r\n`)
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nexec "${real}" "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755)
  return bin
}

