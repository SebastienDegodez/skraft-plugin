import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createGitCommitReplay } from '../../../../plugins/skraft-framework/engine/infrastructure/source-control/git-commit-replay.mjs'
import { createNodeCommandRunner } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { createModCommandRunner } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/mod-processes.mjs'
import { nodeModRun } from '../claude-mod/support/scripted-mod-host.mjs'
import { commitAll, git, tempFolder } from '../support/workspace.mjs'

const check = (/** @type {number} */ code) => `console.log(process.cwd()); process.exit(${code})\n`

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

  const atA = await replay.run({ repository, sha: a, cwd: '.', argv: [process.execPath, 'check.mjs'] })
  const atB = await replay.run({ repository, sha: b, cwd: '.', argv: [process.execPath, 'check.mjs'] })

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

  assert.equal((await replay.run({ repository, sha: a, cwd: 'services/api', argv: [process.execPath, 'check.mjs'] })).exitCode, 3)
  assert.equal((await replay.run({ repository, sha: b, cwd: 'services/api', argv: [process.execPath, 'check.mjs'] })).exitCode, 4)
  assert.deepEqual(snapshot(repo), before)
})

test('a commit that cannot be checked out is not started, and says why', async (t) => {
  const { work, repo, repository } = replayRepository(t)
  const replay = createGitCommitReplay({ commandRunner: createNodeCommandRunner({ root: work }) })
  const unknown = 'f'.repeat(40)

  const result = await replay.run({ repository, sha: unknown, cwd: '.', argv: [process.execPath, 'check.mjs'] })

  assert.equal(result.started, false)
  assert.equal(result.exitCode, null)
  assert.match(result.error, new RegExp(`^could not check out ${unknown} in \\.: .+`))
  assert.equal(snapshot(repo).worktrees, 1)
  assert.equal((await replay.run({ repository, sha: '--help', cwd: '.', argv: ['node'] })).started, false)
})

test('the Claude Code mod replays a commit through $.process.run, from a linked worktree whose git dir is absolute', async (t) => {
  const { repo, a, b } = replayRepository(t)
  const linked = join(repo, '..', 'linked')
  git(repo, 'worktree', 'add', '-q', '--detach', linked, b)
  assert.match(git(linked, 'rev-parse', '--git-common-dir'), /^(?:\/|[A-Za-z]:)/)
  const replay = createGitCommitReplay({ commandRunner: createModCommandRunner({ run: nodeModRun, root: linked }) })
  const before = { main: snapshot(repo), linked: git(linked, 'status', '--porcelain') }

  const atA = await replay.run({ repository: '.', sha: a, cwd: 'services/api', argv: [process.execPath, 'check.mjs'] })
  const atB = await replay.run({ repository: '.', sha: b, cwd: '.', argv: [process.execPath, 'check.mjs'] })

  assert.equal(atA.exitCode, 3)
  assert.equal(atB.exitCode, 0)
  assert.deepEqual({ main: snapshot(repo), linked: git(linked, 'status', '--porcelain') }, before)
  assert.equal(before.main.worktrees, 2)
})
