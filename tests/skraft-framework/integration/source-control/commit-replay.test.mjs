import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGitCommitReplay } from '../../../../plugins/skraft-framework/engine/infrastructure/source-control/git-commit-replay.mjs'
import { createNodeCommandRunner } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { createModCommandRunner } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/mod-processes.mjs'
import { nodeModRun } from '../claude-mod/support/scripted-mod-host.mjs'
import { commitAll, git, tempFolder } from '../support/workspace.mjs'

const check = (/** @type {number} */ code) => `console.log(process.cwd()); process.exit(${code})\n`

/** A runner that records each argv it starts, then starts it. */
const recording = (runner, calls) => ({ run: (request) => { calls.push(request.argv); return runner.run(request) } })

/**
 * Where a replay checks a commit of the repository out: the temporary folder, one folder per
 * repository (its git common dir hashed), one per commit.
 * @param {string} repo @param {string} sha
 */
const replayFolder = (repo, sha) => join(tmpdir(), 'skraft-replay', createHash('sha256').update(join(repo, '.git')).digest('hex').slice(0, 12), sha)

/**
 * `work/` is the working copy; its repository is `work/` itself, or the neighbour `repo/`.
 * check.mjs fails at commit A, passes at commit B; the working copy then holds edits of its own.
 */
const replayRepository = (t, { neighbour = false } = {}) => {
  const top = tempFolder(t)
  const work = join(top, 'work')
  const repo = neighbour ? join(top, 'repo') : work
  mkdirSync(join(repo, 'services', 'api'), { recursive: true })
  mkdirSync(work, { recursive: true })
  writeFileSync(join(repo, 'check.mjs'), check(1))
  writeFileSync(join(repo, 'services', 'api', 'check.mjs'), check(3))
  const a = commitAll(repo, 'A')
  writeFileSync(join(repo, 'check.mjs'), check(0))
  writeFileSync(join(repo, 'services', 'api', 'check.mjs'), check(4))
  git(repo, 'commit', '-q', '-am', 'B')
  const b = git(repo, 'rev-parse', 'HEAD')
  writeFileSync(join(repo, 'check.mjs'), check(7))
  writeFileSync(join(repo, 'notes.txt'), 'untracked\n')
  return { work, repo, a, b, repository: neighbour ? '../repo' : '.' }
}

/** What the working copy looks like: its files and git status. @param {string} repo */
const snapshot = (repo) => ({
  check: readFileSync(join(repo, 'check.mjs'), 'utf8'),
  notes: readFileSync(join(repo, 'notes.txt'), 'utf8'),
  status: git(repo, 'status', '--porcelain'),
  worktrees: git(repo, 'worktree', 'list', '--porcelain').split(/\r?\n/).filter((line) => line.startsWith('worktree ')).length,
})

test('a program replayed at a commit runs on that commit\'s files, and the working copy is left as it was', async (t) => {
  const { work, repo, a, b, repository } = replayRepository(t)
  const replay = createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: work }) })
  const before = snapshot(repo)

  const atA = await replay.run({ repository, sha: a, cwd: '.', choices: [[process.execPath, 'check.mjs']], importRoots: [] })
  const atB = await replay.run({ repository, sha: b, cwd: '.', choices: [[process.execPath, 'check.mjs']], importRoots: [] })

  assert.equal(atA.started, true)
  assert.equal(atA.exitCode, 1)
  assert.equal(atB.exitCode, 0)
  assert.notEqual(atA.stdout.trim(), repo)
  assert.deepEqual(snapshot(repo), before)
  assert.equal(before.worktrees, 1)
})

test('the program starts from a component folder of the commit, in a neighbour repository too', async (t) => {
  const { work, repo, a, b, repository } = replayRepository(t, { neighbour: true })
  const replay = createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: work }) })
  const before = snapshot(repo)

  assert.equal((await replay.run({ repository, sha: a, cwd: 'services/api', choices: [[process.execPath, 'check.mjs']], importRoots: [] })).exitCode, 3)
  assert.equal((await replay.run({ repository, sha: b, cwd: 'services/api', choices: [[process.execPath, 'check.mjs']], importRoots: [] })).exitCode, 4)
  assert.deepEqual(snapshot(repo), before)
})

test('the commit is checked out outside the git dir, where a tool that skips folders named .git (Vite does) sees its files', async (t) => {
  const repo = tempFolder(t)
  writeFileSync(join(repo, 'where.cjs'), "process.exit(process.cwd().split(require('node:path').sep).includes('.git') ? 9 : 0)\n")
  const sha = commitAll(repo, 'where')
  const calls = []
  const replay = createGitCommitReplay({ commandRunner: recording(createNodeCommandRunner({ root: repo }), calls) })

  assert.equal((await replay.run({ repository: '.', sha, cwd: '.', choices: [[process.execPath, 'where.cjs']], importRoots: [] })).exitCode, 0)
  assert.deepEqual(calls.filter((argv) => argv.includes('add')).map((argv) => argv.at(-2)), [replayFolder(repo, sha)])
})

test('two clones of a repository replay the same commit in folders of their own', async (t) => {
  const { repo, a } = replayRepository(t)
  const clone = join(tempFolder(t), 'clone')
  git(repo, 'clone', '-q', repo, clone)
  const folders = []
  for (const top of [repo, clone]) {
    const calls = []
    await createGitCommitReplay({ commandRunner: recording(createNodeCommandRunner({ root: top }), calls) }).run({ repository: '.', sha: a, cwd: '.', choices: [[process.execPath, 'check.mjs']], importRoots: [] })
    folders.push(calls.find((argv) => argv.includes('add')).at(-2))
  }

  assert.deepEqual(folders, [replayFolder(repo, a), replayFolder(clone, a)])
  assert.notEqual(folders[0], folders[1])
})

test('a machine that cannot name a folder outside the repository does not start the program', async (t) => {
  const { work, a, repository } = replayRepository(t)
  const real = createNodeCommandRunner({ root: work })
  const replay = createGitCommitReplay({ commandRunner: { run: (request) => (request.argv[0] === 'node' ? Promise.resolve({ started: false, exitCode: null, stdout: '', stderr: '', error: 'node could not be started' }) : real.run(request)) } })

  const result = await replay.run({ repository, sha: a, cwd: '.', choices: [[process.execPath, 'check.mjs']], importRoots: [] })

  assert.deepEqual([result.started, result.exitCode, result.error], [false, null, `could not check out ${a} in .: no folder outside the repository to check it out in`])
})

test('the program choices are tried in one checkout: the first that starts runs, and none starting is said in fixed words', async (t) => {
  const { work, a, repository } = replayRepository(t)
  const calls = []
  const replay = createGitCommitReplay({ commandRunner: recording(createNodeCommandRunner({ root: work }), calls) })

  const found = await replay.run({ repository, sha: a, cwd: '.', choices: [['no-such-program-skraft'], [process.execPath, 'check.mjs']], importRoots: [] })
  const none = await replay.run({ repository, sha: a, cwd: '.', choices: [['no-such-program-skraft'], ['no-such-program-skraft-2']], importRoots: [] })

  assert.equal(found.exitCode, 1)
  assert.deepEqual([none.started, none.exitCode, none.error], [false, null, 'could not start no-such-program-skraft nor no-such-program-skraft-2'])
  assert.equal(calls.filter((argv) => argv.includes('add')).length, 2)
})

test('a commit that cannot be checked out is not started, and says why', async (t) => {
  const { work, repo, repository } = replayRepository(t)
  const replay = createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: work }) })
  const unknown = 'f'.repeat(40)

  const result = await replay.run({ repository, sha: unknown, cwd: '.', choices: [[process.execPath, 'check.mjs'], ['python3']], importRoots: [] })

  assert.equal(result.started, false)
  assert.equal(result.exitCode, null)
  assert.match(result.error, new RegExp(`^could not check out ${unknown} in \\.: .+`))
  assert.equal(snapshot(repo).worktrees, 1)
  assert.equal((await replay.run({ repository, sha: '--help', cwd: '.', choices: [['node']], importRoots: [] })).started, false)
})

test('the Claude Code mod replays a commit through $.process.run, from a linked worktree whose git dir is absolute', async (t) => {
  const { repo, a, b } = replayRepository(t)
  const linked = join(repo, '..', 'linked')
  git(repo, 'worktree', 'add', '-q', '--detach', linked, b)
  assert.match(git(linked, 'rev-parse', '--git-common-dir'), /^(?:\/|[A-Za-z]:)/)
  const replay = createGitCommitReplay({ commandRunner: createModCommandRunner({ run: nodeModRun, root: linked }) })
  const before = { main: snapshot(repo), linked: git(linked, 'status', '--porcelain') }

  const atA = await replay.run({ repository: '.', sha: a, cwd: 'services/api', choices: [[process.execPath, 'check.mjs']], importRoots: [] })
  const atB = await replay.run({ repository: '.', sha: b, cwd: '.', choices: [[process.execPath, 'check.mjs']], importRoots: [] })

  assert.equal(atA.exitCode, 3)
  assert.equal(atB.exitCode, 0)
  assert.deepEqual({ main: snapshot(repo), linked: git(linked, 'status', '--porcelain') }, before)
  assert.equal(before.main.worktrees, 2)
})

/** `uses.cjs` exits with what the `dep` package it finds answers, plus 10 when a `.venv` sits beside it, plus 100 when a `build` folder does. */
const USES = "const { existsSync } = require('node:fs'); process.exit(require('dep') + (existsSync('.venv/pyvenv.cfg') ? 10 : 0) + (existsSync('build') ? 100 : 0))\n"

/**
 * A repository whose commit `sha` holds `uses.cjs` at its top and in `services/api`, its commit
 * `early` only at its top, and whose working copy installs, ignored by Git, `dep` answering 5 at
 * the top and 6 in `services/api`, and a `.venv` in `services/api`; it also built
 * `services/api/build`, ignored too.
 */
const installedRepository = (t) => {
  const repo = tempFolder(t)
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n.venv/\nbuild/\n')
  writeFileSync(join(repo, 'uses.cjs'), USES)
  const early = commitAll(repo, 'uses')
  mkdirSync(join(repo, 'services', 'api'), { recursive: true })
  writeFileSync(join(repo, 'services', 'api', 'uses.cjs'), USES)
  const sha = commitAll(repo, 'api')
  for (const [folder, answer] of [['.', 5], ['services/api', 6]]) {
    mkdirSync(join(repo, folder, 'node_modules', 'dep'), { recursive: true })
    writeFileSync(join(repo, folder, 'node_modules', 'dep', 'index.js'), `module.exports = ${answer}\n`)
  }
  mkdirSync(join(repo, 'services', 'api', '.venv'), { recursive: true })
  writeFileSync(join(repo, 'services', 'api', '.venv', 'pyvenv.cfg'), 'home = /usr/bin\n')
  mkdirSync(join(repo, 'services', 'api', 'build'), { recursive: true })
  writeFileSync(join(repo, 'services', 'api', 'build', 'out.txt'), 'built\n')
  return { repo, sha, early }
}

/** Where a replay of the commit links the installed folders, relative to its worktree. */
const LINKED = ['node_modules', 'services/api/.venv', 'services/api/node_modules']

/**
 * A runner that, each time Git is asked to remove a worktree, records the links still standing
 * in it, then lets Git go on.
 * @param {{ run: Function }} runner @param {string} worktree @param {string[][]} standing
 */
const watchingRemovals = (runner, worktree, standing) => ({
  run: (request) => {
    if (request.argv.includes('remove')) standing.push(LINKED.filter((folder) => lstatSync(join(worktree, folder), { throwIfNoEntry: false })?.isSymbolicLink() === true))
    return runner.run(request)
  },
})

/** The installed files, read back. @param {string} repo */
const installed = (repo) => [
  readFileSync(join(repo, 'node_modules', 'dep', 'index.js'), 'utf8'),
  readFileSync(join(repo, 'services', 'api', 'node_modules', 'dep', 'index.js'), 'utf8'),
  readFileSync(join(repo, 'services', 'api', '.venv', 'pyvenv.cfg'), 'utf8'),
]



test('a program replayed at a commit sees the dependencies the working copy installed, at the repository top and in a component folder', async (t) => {
  const { repo, sha } = installedRepository(t)
  const replay = createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: repo }) })

  assert.equal((await replay.run({ repository: '.', sha, cwd: '.', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 5)
  assert.equal((await replay.run({ repository: '.', sha, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 16)
})

test('a commit made before a component folder existed replays with the dependencies of the folders it holds', async (t) => {
  const { repo, early } = installedRepository(t)
  const replay = createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: repo }) })

  assert.equal((await replay.run({ repository: '.', sha: early, cwd: '.', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 5)
})

test('the replay leaves the installed dependencies in place: no link stands in its worktree when Git removes it', async (t) => {
  const { repo, sha } = installedRepository(t)
  const before = { files: installed(repo), status: git(repo, 'status', '--porcelain') }
  const standing = []
  const replay = createGitCommitReplay({ commandRunner: watchingRemovals(createNodeCommandRunner({ root: repo }), replayFolder(repo, sha), standing) })

  assert.equal((await replay.run({ repository: '.', sha, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 16)
  assert.deepEqual({ files: installed(repo), status: git(repo, 'status', '--porcelain') }, before)
  assert.deepEqual(standing, [[], []])
  assert.equal(existsSync(replayFolder(repo, sha)), false)
})

test('a commit that holds a dependency folder of its own replays with it, and the working copy\'s are linked beside it', async (t) => {
  const repo = tempFolder(t)
  mkdirSync(join(repo, 'node_modules', 'dep'), { recursive: true })
  mkdirSync(join(repo, 'services', 'api'), { recursive: true })
  writeFileSync(join(repo, 'node_modules', 'dep', 'index.js'), 'module.exports = 8\n')
  writeFileSync(join(repo, 'uses.cjs'), USES)
  writeFileSync(join(repo, 'services', 'api', 'uses.cjs'), USES)
  const vendored = commitAll(repo, 'vendored')
  git(repo, 'rm', '-r', '-q', '--cached', 'node_modules')
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n.venv/\n')
  commitAll(repo, 'installed')
  writeFileSync(join(repo, 'node_modules', 'dep', 'index.js'), 'module.exports = 5\n')
  mkdirSync(join(repo, 'services', 'api', 'node_modules', 'dep'), { recursive: true })
  writeFileSync(join(repo, 'services', 'api', 'node_modules', 'dep', 'index.js'), 'module.exports = 6\n')
  mkdirSync(join(repo, 'services', 'api', '.venv'), { recursive: true })
  writeFileSync(join(repo, 'services', 'api', '.venv', 'pyvenv.cfg'), 'home = /usr/bin\n')
  const standing = []
  const replay = createGitCommitReplay({ commandRunner: watchingRemovals(createNodeCommandRunner({ root: repo }), replayFolder(repo, vendored), standing) })

  assert.equal((await replay.run({ repository: '.', sha: vendored, cwd: '.', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 8)
  assert.equal((await replay.run({ repository: '.', sha: vendored, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 16)
  assert.deepEqual(standing, [[], [], [], []])
  assert.equal(readFileSync(join(repo, 'node_modules', 'dep', 'index.js'), 'utf8'), 'module.exports = 5\n')
})

test('a leftover replay worktree whose links still stand is removed without touching the installed dependencies', async (t) => {
  const { repo, sha } = installedRepository(t)
  const leftover = replayFolder(repo, sha)
  git(repo, 'worktree', 'add', '-q', '--detach', leftover, sha)
  symlinkSync(join(repo, 'services', 'api', 'node_modules'), join(leftover, 'services', 'api', 'node_modules'), 'junction')
  const before = installed(repo)
  const replay = createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: repo }) })

  assert.equal((await replay.run({ repository: '.', sha, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 16)
  assert.deepEqual(installed(repo), before)
})

test('a working copy that installs no dependency starts no node for links', async (t) => {
  const { work, a, repository } = replayRepository(t)
  const calls = []
  const replay = createGitCommitReplay({ commandRunner: recording(createNodeCommandRunner({ root: work }), calls) })

  assert.equal((await replay.run({ repository, sha: a, cwd: '.', choices: [[process.execPath, 'check.mjs']], importRoots: [] })).exitCode, 1)
  assert.deepEqual(calls.filter((argv) => argv[1] === '-e' && ['link', 'unlink'].includes(argv[4])), [])
})

test('dependencies that cannot be linked leave the program unstarted, so it cannot fail for their lack', async (t) => {
  const { repo, sha } = installedRepository(t)
  const calls = []
  const real = recording(createNodeCommandRunner({ root: repo }), calls)
  const refusing = { run: (request) => (request.argv[4] === 'link' ? Promise.resolve({ started: true, exitCode: 1, stdout: '', stderr: 'EPERM' }) : real.run(request)) }
  const replay = createGitCommitReplay({ commandRunner: refusing })

  const result = await replay.run({ repository: '.', sha, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })

  assert.deepEqual([result.started, result.exitCode, result.error], [false, null, `could not check out ${sha} in .: the dependencies installed in the working copy could not be linked`])
  assert.equal(calls.some((argv) => argv[1] === 'uses.cjs'), false)
  assert.equal(existsSync(replayFolder(repo, sha)), false)
})

/**
 * `imports.cjs` exits 0 when PYTHONPATH starts with its own `src` then `lib` folders and keeps
 * what was set before, 3 when it does not start with them, 4 when it lost the earlier value.
 */
const IMPORTS = "const { delimiter, resolve } = require('node:path'); const roots = (process.env.PYTHONPATH ?? '').split(delimiter); process.exit(roots[0] !== resolve('src') || roots[1] !== resolve('lib') ? 3 : roots[2] !== 'kept' ? 4 : 0)\n"

test('a Python program replayed at a commit finds the commit\'s own source folders first on its import path, before an editable install of the working copy', async (t) => {
  const repo = tempFolder(t)
  mkdirSync(join(repo, 'services', 'api'), { recursive: true })
  writeFileSync(join(repo, 'services', 'api', 'imports.cjs'), IMPORTS)
  const sha = commitAll(repo, 'imports')
  const before = process.env.PYTHONPATH
  process.env.PYTHONPATH = 'kept'
  t.after(() => { if (before === undefined) delete process.env.PYTHONPATH; else process.env.PYTHONPATH = before })
  const choices = [['no-such-program-skraft'], [process.execPath, 'imports.cjs']]

  for (const commandRunner of [createNodeCommandRunner({ root: repo }), createModCommandRunner({ run: nodeModRun, root: repo })]) {
    const replay = createGitCommitReplay({ commandRunner })
    assert.equal((await replay.run({ repository: '.', sha, cwd: 'services/api', choices, importRoots: ['src', 'lib'] })).exitCode, 0)
    const none = await replay.run({ repository: '.', sha, cwd: 'services/api', choices: [['no-such-program-skraft']], importRoots: ['src'] })
    assert.deepEqual([none.started, none.error], [false, 'could not start no-such-program-skraft'])
  }
})

test('a program with no import roots starts as written, its environment untouched', async (t) => {
  const repo = tempFolder(t)
  writeFileSync(join(repo, 'bare.cjs'), "process.exit('PYTHONPATH' in process.env ? 5 : 0)\n")
  const sha = commitAll(repo, 'bare')
  const before = process.env.PYTHONPATH
  delete process.env.PYTHONPATH
  t.after(() => { if (before !== undefined) process.env.PYTHONPATH = before })
  const replay = createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: repo }) })

  assert.equal((await replay.run({ repository: '.', sha, cwd: '.', choices: [[process.execPath, 'bare.cjs']], importRoots: [] })).exitCode, 0)
})

test('the Claude Code mod links the installed dependencies too, into a worktree under an absolute git dir', async (t) => {
  const { repo, sha } = installedRepository(t)
  const linked = join(repo, '..', `${sha.slice(0, 7)}-linked`)
  git(repo, 'worktree', 'add', '-q', '--detach', linked, sha)
  for (const folder of ['node_modules/dep', 'services/api/node_modules/dep', 'services/api/.venv']) cpSync(join(repo, folder), join(linked, folder), { recursive: true })
  writeFileSync(join(linked, 'node_modules', 'dep', 'index.js'), 'module.exports = 7\n')
  const replay = createGitCommitReplay({ commandRunner: createModCommandRunner({ run: nodeModRun, root: linked }) })

  assert.equal((await replay.run({ repository: '.', sha, cwd: '.', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 7)
  assert.equal((await replay.run({ repository: '.', sha, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 16)
  assert.equal(readFileSync(join(linked, 'node_modules', 'dep', 'index.js'), 'utf8'), 'module.exports = 7\n')
})
