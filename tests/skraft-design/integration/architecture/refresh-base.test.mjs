import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createNodeAdapters } from '../../../../plugins/skraft-design/engine/infrastructure/node-adapters.mjs'

/** A repository whose main moved on after the run's branch left it; `own` commits on the branch first. */
const repository = async (t, { own = null, conflict = false } = {}) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skraft refresh ')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const git = (...args) => { const done = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(done.status, 0, done.stderr); return done.stdout.trim() }
  git('init', '--quiet', '--initial-branch=main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test')
  await writeFile(join(root, 'README.md'), 'one\n'); git('add', '.'); git('commit', '--quiet', '-m', 'chore: start')
  git('switch', '--quiet', '-c', 'design/issue-205')
  if (own) { await writeFile(join(root, own), conflict ? 'branch\n' : 'design\n'); git('add', '.'); git('commit', '--quiet', '-m', 'docs: design') }
  git('switch', '--quiet', 'main')
  await writeFile(join(root, conflict ? own : 'backend.txt'), 'main\n'); git('add', '.'); git('commit', '--quiet', '-m', 'feat: backend')
  const moved = git('rev-parse', 'HEAD')
  git('switch', '--quiet', 'design/issue-205')
  return { root, git, moved, sourceControl: createNodeAdapters({ cwd: root, pluginRoot: root }).sourceControl }
}

test('the default branch taken into a run branch with no commit of its own fast-forwards it', async (t) => {
  const { git, moved, sourceControl } = await repository(t)
  assert.deepEqual(await sourceControl.takeBase('.', moved, 'chore(issue-205): take the default branch as it is now'), { ok: true })
  assert.equal(git('rev-parse', 'HEAD'), moved)
})

test('taken into a run branch with commits of its own, the default branch comes in by one merge commit that keeps them', async (t) => {
  const { git, moved, sourceControl } = await repository(t, { own: 'design.md' })
  assert.deepEqual(await sourceControl.takeBase('.', moved, 'chore(issue-205): take the default branch as it is now'), { ok: true })
  assert.equal(git('log', '-1', '--format=%s'), 'chore(issue-205): take the default branch as it is now')
  assert.equal(git('merge-base', '--is-ancestor', moved, 'HEAD') === '', true)
  assert.equal(git('ls-files', 'design.md', 'backend.txt').split('\n').length, 2)
})

test('a conflict undoes the merge: the branch and the working copy stay as they were', async (t) => {
  const { git, moved, sourceControl } = await repository(t, { own: 'shared.md', conflict: true })
  const before = git('rev-parse', 'HEAD')
  const taken = await sourceControl.takeBase('.', moved, 'chore(issue-205): take the default branch as it is now')
  assert.equal(taken.ok, false)
  assert.equal(taken.conflict, true)
  assert.equal(git('rev-parse', 'HEAD'), before)
  assert.equal(git('status', '--porcelain'), '')
})
