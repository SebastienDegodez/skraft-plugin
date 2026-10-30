import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { createGitCommitReplay } from '../../../../plugins/skraft-framework/engine/infrastructure/source-control/git-commit-replay.mjs'
import { createNodeCommandRunner } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { createModCommandRunner } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/mod-processes.mjs'
import { nodeModRun } from '../claude-mod/support/scripted-mod-host.mjs'
import { commitAll, git, tempFolder } from '../support/workspace.mjs'

const check = (/** @type {number} */ code) => `console.log(process.cwd()); process.exit(${code})\n`

/** A runner that records each argv it starts, then starts it. */
const recording = (runner, calls) => ({ run: (request) => { calls.push(request.argv); return runner.run(request) } })

/**
 * The folder a repository's replays check commits out in: `<tmp>/skraft-replay-<uid>/<id>`, the
 * id hashed from its git common dir; each replay makes its own folder in it.
 * @param {string} repo @param {string} [base] the temporary folder
 */
const replayParent = (repo, base = tmpdir()) => join(base, `skraft-replay-${process.getuid?.() ?? 'user'}`, createHash('sha256').update(join(repo, '.git')).digest('hex').slice(0, 12))

/** The folder each replay added its worktree in, in order. @param {string[][]} calls */
const addedFolders = (calls) => calls.filter((argv) => argv.includes('add')).map((argv) => argv.at(-2))

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
  const [folder] = addedFolders(calls)
  assert.equal(dirname(folder), replayParent(repo))
  assert.match(basename(folder), new RegExp(`^${sha.slice(0, 7)}-`))
})

test('two clones of a repository replay the same commit in folders of their own', async (t) => {
  const { repo, a } = replayRepository(t)
  const clone = join(tempFolder(t), 'clone')
  git(repo, 'clone', '-q', repo, clone)
  const folders = []
  for (const top of [repo, clone]) {
    const calls = []
    await createGitCommitReplay({ commandRunner: recording(createNodeCommandRunner({ root: top }), calls) }).run({ repository: '.', sha: a, cwd: '.', choices: [[process.execPath, 'check.mjs']], importRoots: [] })
    folders.push(dirname(addedFolders(calls)[0]))
  }

  assert.deepEqual(folders, [replayParent(repo), replayParent(clone)])
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

test('a commit that cannot be checked out is not started, says why, and leaves no folder behind', async (t) => {
  const { work, repo, repository } = replayRepository(t)
  const calls = []
  const replay = createGitCommitReplay({ commandRunner: recording(createNodeCommandRunner({ root: work }), calls) })
  const unknown = 'f'.repeat(40)

  const result = await replay.run({ repository, sha: unknown, cwd: '.', choices: [[process.execPath, 'check.mjs'], ['python3']], importRoots: [] })

  assert.equal(result.started, false)
  assert.equal(result.exitCode, null)
  assert.equal(result.error, `could not check out ${unknown} in .: Git could not add a worktree for it`)
  assert.equal(snapshot(repo).worktrees, 1)
  const [folder] = addedFolders(calls)
  assert.equal(dirname(folder), replayParent(repo))
  assert.equal(existsSync(folder), false)
  assert.equal((await replay.run({ repository, sha: '--help', cwd: '.', choices: [['node']], importRoots: [] })).started, false)

  const plain = join(tempFolder(t), 'plain')
  mkdirSync(plain)
  const outside = await createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: plain }) }).run({ repository: '.', sha: unknown, cwd: '.', choices: [['node']], importRoots: [] })
  assert.equal(outside.error, `could not check out ${unknown} in .: Git cannot tell where the repository keeps its data`)
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
 * @param {{ run: Function }} runner @param {string[][]} standing
 */
const watchingRemovals = (runner, standing) => ({
  run: (request) => {
    if (request.argv.includes('remove')) standing.push(LINKED.flatMap((folder) => linksIn(request.argv.at(-1), folder)))
    return runner.run(request)
  },
})

/**
 * The links standing at a folder of a worktree: the folder itself, or the links in it, one level
 * further in a `@scope` or `.bin` folder; relative to the worktree.
 * @param {string} worktree @param {string} folder
 */
const linksIn = (worktree, folder) => {
  const path = join(worktree, folder)
  const stat = lstatSync(path, { throwIfNoEntry: false })
  if (stat === undefined) return []
  if (stat.isSymbolicLink()) return [folder]
  if (!stat.isDirectory()) return []
  return readdirSync(path).flatMap((name) => {
    const inner = join(path, name)
    if (lstatSync(inner).isSymbolicLink()) return [`${folder}/${name}`]
    return (name.startsWith('@') || name === '.bin') && lstatSync(inner).isDirectory() ? linksIn(worktree, `${folder}/${name}`).filter((link) => link !== `${folder}/${name}`) : []
  })
}

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
  const calls = []
  const replay = createGitCommitReplay({ commandRunner: watchingRemovals(recording(createNodeCommandRunner({ root: repo }), calls), standing) })

  assert.equal((await replay.run({ repository: '.', sha, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 16)
  assert.deepEqual({ files: installed(repo), status: git(repo, 'status', '--porcelain') }, before)
  assert.deepEqual(standing, [[]])
  assert.equal(existsSync(addedFolders(calls)[0]), false)
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
  const replay = createGitCommitReplay({ commandRunner: watchingRemovals(createNodeCommandRunner({ root: repo }), standing) })

  assert.equal((await replay.run({ repository: '.', sha: vendored, cwd: '.', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 8)
  assert.equal((await replay.run({ repository: '.', sha: vendored, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 16)
  assert.deepEqual(standing, [[], []])
  assert.equal(readFileSync(join(repo, 'node_modules', 'dep', 'index.js'), 'utf8'), 'module.exports = 5\n')
})

/** `web/sum.cjs` exits with the sum of what its three packages answer. */
const SUM = "process.exit(require('core') + require('@acme/util') + require('dep'))\n"

/**
 * An npm workspace: `packages/core` and the scoped `packages/util` linked into the root
 * `node_modules` by relative links, as npm does, beside an installed `dep` answering 5. The commit
 * `sha` has core answer 1 and util 10; the working copy has since changed them to 2 and 20.
 */
const workspaceRepository = (t) => {
  const repo = tempFolder(t)
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n')
  for (const [folder, answer] of [['core', 1], ['util', 10]]) {
    mkdirSync(join(repo, 'packages', folder), { recursive: true })
    writeFileSync(join(repo, 'packages', folder, 'index.js'), `module.exports = ${answer}\n`)
  }
  mkdirSync(join(repo, 'web'))
  writeFileSync(join(repo, 'web', 'sum.cjs'), SUM)
  const sha = commitAll(repo, 'workspace')
  writeFileSync(join(repo, 'packages', 'core', 'index.js'), 'module.exports = 2\n')
  writeFileSync(join(repo, 'packages', 'util', 'index.js'), 'module.exports = 20\n')
  mkdirSync(join(repo, 'node_modules', 'dep'), { recursive: true })
  mkdirSync(join(repo, 'node_modules', '@acme'))
  writeFileSync(join(repo, 'node_modules', 'dep', 'index.js'), 'module.exports = 5\n')
  writeFileSync(join(repo, 'node_modules', '.package-lock.json'), '{}\n')
  symlinkSync(join('..', 'packages', 'core'), join(repo, 'node_modules', 'core'), 'junction')
  symlinkSync(join('..', '..', 'packages', 'util'), join(repo, 'node_modules', '@acme', 'util'), 'junction')
  return { repo, sha }
}

test('in an npm workspace, a replayed commit imports its sibling packages, scoped ones too, from the commit; the working copy keeps its links', async (t) => {
  const { repo, sha } = workspaceRepository(t)
  const standing = []
  const replay = createGitCommitReplay({ commandRunner: watchingRemovals(createNodeCommandRunner({ root: repo }), standing) })

  assert.equal((await replay.run({ repository: '.', sha, cwd: 'web', choices: [[process.execPath, 'sum.cjs']], importRoots: [] })).exitCode, 16)
  assert.deepEqual(standing, [[]])
  assert.equal(lstatSync(join(repo, 'node_modules', 'core')).isSymbolicLink(), true)
  assert.equal(lstatSync(join(repo, 'node_modules', '@acme', 'util')).isSymbolicLink(), true)
  assert.deepEqual([readFileSync(join(repo, 'node_modules', 'core', 'index.js'), 'utf8'), readFileSync(join(repo, 'node_modules', 'dep', 'index.js'), 'utf8')], ['module.exports = 2\n', 'module.exports = 5\n'])
  assert.equal(readFileSync(join(repo, 'node_modules', '.package-lock.json'), 'utf8'), '{}\n')
})

// npm links a bin as a relative symbolic link only outside Windows, where it writes shims instead.
test('in an npm workspace, a replayed commit runs the bin of a sibling package from the commit', { skip: process.platform === 'win32' }, async (t) => {
  const { repo, sha } = workspaceRepository(t)
  writeFileSync(join(repo, 'packages', 'core', 'bin.js'), 'process.exit(1)\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'bin')
  const withBin = git(repo, 'rev-parse', 'HEAD')
  writeFileSync(join(repo, 'packages', 'core', 'bin.js'), 'process.exit(2)\n')
  mkdirSync(join(repo, 'node_modules', '.bin'))
  symlinkSync(join('..', 'core', 'bin.js'), join(repo, 'node_modules', '.bin', 'core'))
  const standing = []
  const replay = createGitCommitReplay({ commandRunner: watchingRemovals(createNodeCommandRunner({ root: repo }), standing) })

  assert.equal((await replay.run({ repository: '.', sha: withBin, cwd: '.', choices: [[process.execPath, 'node_modules/.bin/core']], importRoots: [] })).exitCode, 1)
  assert.deepEqual(standing, [[]])
  assert.equal(lstatSync(join(repo, 'node_modules', '.bin', 'core')).isSymbolicLink(), true)
  assert.notEqual(sha, withBin)
})

/** Every link standing under a folder, never followed, relative to it. @param {string} root @param {string} [folder] @returns {string[]} */
const everyLink = (root, folder = '') => {
  const path = join(root, folder)
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) return [folder]
  if (!stat.isDirectory()) return []
  return readdirSync(path).flatMap((name) => everyLink(root, join(folder, name)))
}

/** Like `watchingRemovals`, but every link standing anywhere in the worktree counts. @param {{ run: Function }} runner @param {string[][]} standing */
const watchingAllLinks = (runner, standing) => ({
  run: (request) => {
    if (request.argv.includes('remove')) standing.push(everyLink(request.argv.at(-1)))
    return runner.run(request)
  },
})

const link = (repo, target, at) => {
  mkdirSync(dirname(join(repo, at)), { recursive: true })
  symlinkSync(target, join(repo, at), 'junction')
}

/** The store's files, each `[path in the repository, text]`, beside the two files pnpm keeps in it. @param {string} repo @param {string[][]} files */
const writeStore = (repo, files) => {
  for (const [path, text] of [['node_modules/.modules.yaml', 'hoist: true\n'], ['node_modules/.pnpm/lock.yaml', 'lockfileVersion: 9\n'], ...files]) {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
}

const STORE_PACKAGES = [
  ['node_modules/.pnpm/lib@1.0.0/node_modules/lib/index.js', "module.exports = require('core') + require('ext')\n"],
  ['node_modules/.pnpm/wrap@1.0.0/node_modules/wrap/index.js', "module.exports = require('lib') + 100\n"],
  ['node_modules/.pnpm/@acme+kit@1.0.0/node_modules/@acme/kit/index.js', "module.exports = require('@acme/util')\n"],
  ['node_modules/.pnpm/dep@1.0.0/node_modules/dep/index.js', 'module.exports = 5\n'],
  ['node_modules/.pnpm/phantom@1.0.0/node_modules/phantom/index.js', "module.exports = require('core') + require('pal')\n"],
]

const IN_STORE = join('..', '..', '..', 'node_modules', '.pnpm')

/**
 * A pnpm workspace: `packages/core` and the scoped `packages/util` are siblings of `apps/web`,
 * whose `node_modules` links into the root `node_modules/.pnpm` store as pnpm lays it out. The
 * commit `sha` has core answer 1 and util 10; the working copy has since changed them to 2 and
 * 20, and installed `lib` (reads core, and `ext` outside the repository, answering 40), `wrap`
 * (reads lib), `@acme/kit` (reads util by an absolute link) and `dep` (reads nothing). With
 * `reached: false` the store holds `dep` alone: no package of it reaches a sibling.
 */
const pnpmRepository = (t, { reached = true } = {}) => {
  const repo = tempFolder(t)
  const ext = `${repo}-ext`
  t.after(() => rmSync(ext, { recursive: true, force: true }))
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n')
  for (const [path, text] of [
    ['packages/core/index.js', 'module.exports = 1\n'],
    ['packages/util/index.js', 'module.exports = 10\n'],
    ['apps/web/main.cjs', "process.exit(require('lib'))\n"],
    ['apps/web/wrap.cjs', "process.exit(require('wrap'))\n"],
    ['apps/web/kit.cjs', "process.exit(require('@acme/kit'))\n"],
    ['apps/web/phantom.cjs', "process.exit(require('phantom'))\n"],
    ['apps/web/store.cjs', "const { lstatSync } = require('node:fs'); const { join } = require('node:path'); process.exit(lstatSync(join(__dirname, '..', '..', 'node_modules', '.pnpm')).isSymbolicLink() ? require('dep') : 1)\n"],
  ]) {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
  const sha = commitAll(repo, 'workspace')
  writeFileSync(join(repo, 'packages', 'core', 'index.js'), 'module.exports = 2\n')
  writeFileSync(join(repo, 'packages', 'util', 'index.js'), 'module.exports = 20\n')
  link(repo, join(IN_STORE, 'dep@1.0.0', 'node_modules', 'dep'), 'apps/web/node_modules/dep')
  if (!reached) return { repo, sha, ...writeStore(repo, [STORE_PACKAGES[3]]) }
  mkdirSync(join(ext, 'ext'), { recursive: true })
  writeFileSync(join(ext, 'ext', 'index.js'), 'module.exports = 40\n')
  writeStore(repo, STORE_PACKAGES)
  const store = 'node_modules/.pnpm'
  link(repo, join('..', '..', '..', '..', 'packages', 'core'), `${store}/lib@1.0.0/node_modules/core`)
  link(repo, join(ext, 'ext'), `${store}/lib@1.0.0/node_modules/ext`)
  link(repo, join('..', '..', 'lib@1.0.0', 'node_modules', 'lib'), `${store}/wrap@1.0.0/node_modules/lib`)
  link(repo, join(repo, 'packages', 'util'), `${store}/@acme+kit@1.0.0/node_modules/@acme/util`)
  link(repo, join('..', '..', '..', 'packages', 'core'), `${store}/node_modules/core`)
  link(repo, join('.pnpm', 'lib@1.0.0', 'node_modules', 'lib'), 'node_modules/lib')
  link(repo, join(IN_STORE, 'lib@1.0.0', 'node_modules', 'lib'), 'apps/web/node_modules/lib')
  link(repo, join(IN_STORE, 'wrap@1.0.0', 'node_modules', 'wrap'), 'apps/web/node_modules/wrap')
  link(repo, join('..', IN_STORE, '@acme+kit@1.0.0', 'node_modules', '@acme', 'kit'), 'apps/web/node_modules/@acme/kit')
  link(repo, join('..', '..', '..', 'packages', 'core'), 'apps/web/node_modules/core')
  link(repo, join(IN_STORE, 'phantom@1.0.0', 'node_modules', 'phantom'), 'apps/web/node_modules/phantom')
  link(repo, join('..', '..', '..', '..', 'packages', 'core'), `${store}/phantom@1.0.0/node_modules/core`)
  link(repo, join('..', '..', '..', 'packages', 'util'), `${store}/node_modules/pal`)
  return { repo, sha }
}

const replayWeb = (replay, sha, program) => replay.run({ repository: '.', sha, cwd: 'apps/web', choices: [[process.execPath, program]], importRoots: [] })

test('in a pnpm workspace, a replayed commit\'s store package imports the commit\'s sibling package, and the working copy\'s store is left as installed', async (t) => {
  const { repo, sha } = pnpmRepository(t)
  const before = git(repo, 'status', '--porcelain')
  const libFile = join(repo, 'node_modules', '.pnpm', 'lib@1.0.0', 'node_modules', 'lib', 'index.js')
  const text = readFileSync(libFile, 'utf8')
  const calls = []
  const standing = []
  const replay = createGitCommitReplay({ commandRunner: watchingAllLinks(recording(createNodeCommandRunner({ root: repo }), calls), standing) })

  assert.equal((await replayWeb(replay, sha, 'main.cjs')).exitCode, 41)
  assert.deepEqual(standing, [[]])
  assert.equal(existsSync(addedFolders(calls)[0]), false)
  assert.equal(lstatSync(join(repo, 'node_modules', '.pnpm', 'lib@1.0.0', 'node_modules', 'core')).isSymbolicLink(), true)
  assert.equal(lstatSync(join(repo, 'apps', 'web', 'node_modules', 'lib')).isSymbolicLink(), true)
  assert.equal(readFileSync(libFile, 'utf8'), text)
  assert.equal(git(repo, 'status', '--porcelain'), before)
})

test('in a pnpm workspace, a store package that reaches a sibling package through another store package imports the commit\'s sibling', async (t) => {
  const { repo, sha } = pnpmRepository(t)
  const standing = []
  const replay = createGitCommitReplay({ commandRunner: watchingAllLinks(createNodeCommandRunner({ root: repo }), standing) })

  assert.equal((await replayWeb(replay, sha, 'wrap.cjs')).exitCode, 141)
  assert.deepEqual(standing, [[]])
})

test('in a pnpm workspace, a scoped store package imports the commit\'s scoped sibling package, through an absolute link', async (t) => {
  const { repo, sha } = pnpmRepository(t)
  const standing = []
  const replay = createGitCommitReplay({ commandRunner: watchingAllLinks(createNodeCommandRunner({ root: repo }), standing) })

  assert.equal((await replayWeb(replay, sha, 'kit.cjs')).exitCode, 10)
  assert.deepEqual(standing, [[]])
})

test('in a pnpm workspace, a store package that reads a sibling it does not declare through the hoisted store folder imports the commit\'s sibling', async (t) => {
  const { repo, sha } = pnpmRepository(t)
  const standing = []
  const replay = createGitCommitReplay({ commandRunner: watchingAllLinks(createNodeCommandRunner({ root: repo }), standing) })

  assert.equal((await replayWeb(replay, sha, 'phantom.cjs')).exitCode, 11)
  assert.deepEqual(standing, [[]])
})

test('in a pnpm workspace, a store package imports the commit\'s sibling package whose folder name starts with two dots', async (t) => {
  const { repo, sha: first } = pnpmRepository(t)
  mkdirSync(join(repo, '..odd'))
  writeFileSync(join(repo, '..odd', 'index.js'), 'module.exports = 3\n')
  writeFileSync(join(repo, 'apps', 'web', 'odd.cjs'), "process.exit(require('odd'))\n")
  const sha = commitAll(repo, 'odd')
  writeFileSync(join(repo, '..odd', 'index.js'), 'module.exports = 4\n')
  writeStore(repo, [['node_modules/.pnpm/odd@1.0.0/node_modules/odd/index.js', "module.exports = require('sib')\n"]])
  link(repo, join(repo, '..odd'), 'node_modules/.pnpm/odd@1.0.0/node_modules/sib')
  link(repo, join(IN_STORE, 'odd@1.0.0', 'node_modules', 'odd'), 'apps/web/node_modules/odd')
  const standing = []
  const replay = createGitCommitReplay({ commandRunner: watchingAllLinks(createNodeCommandRunner({ root: repo }), standing) })

  assert.equal((await replayWeb(replay, sha, 'odd.cjs')).exitCode, 3)
  assert.deepEqual(standing, [[]])
  assert.notEqual(sha, first)
})

test('in a pnpm workspace whose store reaches no sibling package, the replay links the store whole and copies nothing', async (t) => {
  const { repo, sha } = pnpmRepository(t, { reached: false })
  const standing = []
  const replay = createGitCommitReplay({ commandRunner: watchingAllLinks(createNodeCommandRunner({ root: repo }), standing) })

  assert.equal((await replayWeb(replay, sha, 'store.cjs')).exitCode, 5)
  assert.deepEqual(standing, [[]])
})

/**
 * A worktree an earlier replay of the commit left in the repository's replay folder, locked with
 * that reason (null: not locked; '': locked with no reason, which `git worktree lock` alone gives), a link to the installed `services/api/node_modules` in it; it
 * is removed, link first, when the test ends. `base` is the temporary folder, the machine's own
 * when left out.
 */
const leftover = (t, repo, sha, { name, lock, base }) => {
  mkdirSync(replayParent(repo, base), { recursive: true, mode: 0o700 })
  const path = join(replayParent(repo, base), `${sha.slice(0, 7)}-${name}`)
  git(repo, 'worktree', 'add', '-q', '--detach', ...(lock === null || lock === '' ? [] : ['--lock', '--reason', lock]), path, sha)
  if (lock === '') git(repo, 'worktree', 'lock', path)
  const link = join(path, 'services', 'api', 'node_modules')
  symlinkSync(join(repo, 'services', 'api', 'node_modules'), link, 'junction')
  t.after(() => {
    if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(link)
    rmSync(path, { recursive: true, force: true })
  })
  return path
}

test('a replay sweeps the worktrees earlier replays of the repository left, links first, and leaves the running and the hand-locked ones', async (t) => {
  const { repo, sha } = installedRepository(t)
  const unlocked = leftover(t, repo, sha, { name: 'unlocked', lock: null })
  const old = leftover(t, repo, sha, { name: 'old', lock: `skraft-replay ${Date.now() - 7 * 3_600_000}` })
  const running = leftover(t, repo, sha, { name: 'running', lock: `skraft-replay ${Date.now()}` })
  const byHand = leftover(t, repo, sha, { name: 'by-hand', lock: 'kept by hand' })
  const bare = leftover(t, repo, sha, { name: 'bare', lock: '' })
  const empty = join(dirname(replayParent(repo)), `empty-${process.pid}-${Date.now()}`)
  mkdirSync(empty)
  const before = installed(repo)
  const replay = createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: repo }) })

  assert.equal((await replay.run({ repository: '.', sha, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 16)
  assert.deepEqual([unlocked, old, running, byHand, bare, empty].map((folder) => existsSync(folder)), [false, false, true, true, true, false])
  assert.deepEqual(installed(repo), before)
})

test('a replay sweeps a leftover Git names by another spelling of the replay folder, and the installed dependencies stay', async (t) => {
  const base = tempFolder(t)
  const other = base.toUpperCase()
  if (other === base || !existsSync(other)) return t.skip('this file system tells the two spellings apart')
  const { repo, sha } = installedRepository(t)
  const unlocked = leftover(t, repo, sha, { name: 'unlocked', lock: null, base: other })
  const before = installed(repo)
  const env = { ...process.env, TMPDIR: base, TMP: base, TEMP: base }
  const replay = createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: repo, env }) })

  assert.equal((await replay.run({ repository: '.', sha, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 16)
  assert.equal(existsSync(unlocked), false)
  assert.deepEqual(installed(repo), before)
})

test('a leftover worktree whose links could not be removed stays, and Git is never asked to remove it', async (t) => {
  const { repo, sha } = installedRepository(t)
  const stuck = realpathSync.native(leftover(t, repo, sha, { name: 'stuck', lock: null }))
  const calls = []
  const real = recording(createNodeCommandRunner({ root: repo }), calls)
  let refused = 0
  const refusing = {
    run: (request) => {
      if (request.argv[4] !== 'unlink' || realpathSync.native(request.argv[6]) !== stuck) return real.run(request)
      refused += 1
      return Promise.resolve({ started: true, exitCode: 1, stdout: '', stderr: '' })
    },
  }
  const replay = createGitCommitReplay({ commandRunner: refusing })

  assert.equal((await replay.run({ repository: '.', sha, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 16)
  assert.equal(existsSync(stuck), true)
  assert.equal(refused, 1)
  assert.equal(calls.some((argv) => argv.includes('remove') && realpathSync.native(dirname(argv.at(-1))) === dirname(stuck) && basename(argv.at(-1)) === basename(stuck)), false)
})

test('two replays of the same commit at once run in folders of their own, and neither sweeps the other', async (t) => {
  const repo = tempFolder(t)
  writeFileSync(join(repo, 'own.cjs'), "process.exit(require('node:fs').existsSync('own.cjs') ? 0 : 6)\n")
  const sha = commitAll(repo, 'own')
  const calls = []
  const real = recording(createNodeCommandRunner({ root: repo }), calls)
  /** @type {Promise<{ exitCode: number | null }> | null} */
  let inner = null
  const replay = createGitCommitReplay({
    commandRunner: {
      run: async (request) => {
        if (request.argv[1] === 'own.cjs' && inner === null) await (inner = run())
        return real.run(request)
      },
    },
  })
  const run = () => replay.run({ repository: '.', sha, cwd: '.', choices: [[process.execPath, 'own.cjs']], importRoots: [] })

  const outer = await run()
  assert.deepEqual([outer.exitCode, (await inner).exitCode], [0, 0])
  const [first, second] = addedFolders(calls)
  assert.notEqual(first, second)
  assert.equal(git(repo, 'worktree', 'list', '--porcelain').split(/\r?\n/).filter((line) => line.startsWith('worktree ')).length, 1)
})

/**
 * Preloaded in the replay's Node steps: another repository's replay sweeps the empty folders of
 * the replay parent at the worst moment, once: the repository's folder, made a moment ago and
 * still empty, goes just before this replay makes its own folder in it.
 */
const SWEPT_AWAY = [
  "const fs = require('node:fs')",
  "const { dirname } = require('node:path')",
  'const make = fs.mkdtempSync',
  'let swept = false',
  'fs.mkdtempSync = (prefix, ...rest) => {',
  '  if (!swept) fs.rmdirSync(dirname(prefix))',
  '  swept = true',
  '  return make(prefix, ...rest)',
  '}',
  '',
].join('\n')

test('a replay checks its commit out though another replay sweeps the repository\'s folder away while it makes its own', async (t) => {
  const { work, a, repository } = replayRepository(t)
  const sweep = join(tempFolder(t), 'swept-away.cjs')
  writeFileSync(sweep, SWEPT_AWAY)
  const real = createNodeCommandRunner({ root: work })
  const sweeping = { run: (request) => real.run(request.argv[0] === 'node' ? { ...request, argv: ['node', '--require', sweep, ...request.argv.slice(1)] } : request) }

  const result = await createGitCommitReplay({ commandRunner: sweeping }).run({ repository, sha: a, cwd: '.', choices: [[process.execPath, 'check.mjs']], importRoots: [] })

  assert.deepEqual([result.started, result.exitCode, result.error], [true, 1, undefined])
})

/** A replay of commit A of a fresh repository, its temporary folder `base`. */
const replayedIn = (t, base) => {
  const { work, a, repository } = replayRepository(t)
  const env = { ...process.env, TMPDIR: base, TMP: base, TEMP: base }
  const replay = createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: work, env }) })
  return { work, a, replayed: () => replay.run({ repository, sha: a, cwd: '.', choices: [[process.execPath, 'check.mjs']], importRoots: [] }) }
}

test('a replay parent folder that is a link is refused', async (t) => {
  const base = tempFolder(t)
  const { work, a, replayed } = replayedIn(t, base)
  const parent = dirname(replayParent(work, base))
  mkdirSync(join(base, 'elsewhere'), { mode: 0o700 })
  symlinkSync(join(base, 'elsewhere'), parent, 'junction')

  const linked = await replayed()
  unlinkSync(parent)
  const own = await replayed()

  assert.deepEqual([linked.started, linked.exitCode, linked.error], [false, null, `could not check out ${a} in .: no folder outside the repository to check it out in`])
  assert.equal(own.exitCode, 1)
})

test('a replay parent folder others may enter is refused', { skip: process.platform === 'win32' }, async (t) => {
  const base = tempFolder(t)
  const { work, a, replayed } = replayedIn(t, base)
  const parent = dirname(replayParent(work, base))
  mkdirSync(parent)
  chmodSync(parent, 0o755)

  const open = await replayed()
  chmodSync(parent, 0o700)
  const own = await replayed()

  assert.deepEqual([open.started, open.exitCode, open.error], [false, null, `could not check out ${a} in .: no folder outside the repository to check it out in`])
  assert.equal(own.exitCode, 1)
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
  assert.equal(existsSync(addedFolders(calls)[0]), false)
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
  const linked = join(tempFolder(t), `${sha.slice(0, 7)}-linked`)
  git(repo, 'worktree', 'add', '-q', '--detach', linked, sha)
  for (const folder of ['node_modules/dep', 'services/api/node_modules/dep', 'services/api/.venv']) cpSync(join(repo, folder), join(linked, folder), { recursive: true })
  writeFileSync(join(linked, 'node_modules', 'dep', 'index.js'), 'module.exports = 7\n')
  const replay = createGitCommitReplay({ commandRunner: createModCommandRunner({ run: nodeModRun, root: linked }) })

  assert.equal((await replay.run({ repository: '.', sha, cwd: '.', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 7)
  assert.equal((await replay.run({ repository: '.', sha, cwd: 'services/api', choices: [[process.execPath, 'uses.cjs']], importRoots: [] })).exitCode, 16)
  assert.equal(readFileSync(join(linked, 'node_modules', 'dep', 'index.js'), 'utf8'), 'module.exports = 7\n')
})
