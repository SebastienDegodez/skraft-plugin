import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REPOSITORY_ENV, withoutRepositoryEnv } from '../../../eng/lib/repository-env.mjs'

const folder = (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'skraft-local-ci-')))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const git = (cwd, env, ...args) => execFileSync('git', ['-c', 'user.name=skraft', '-c', 'user.email=skraft@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, env, encoding: 'utf8' }).trim()

test('a test run from a git hook commits into its own temporary repository, not into the one being pushed', (t) => {
  const pushed = folder(t)
  git(pushed, process.env, 'init', '-q', '-b', 'main')
  git(pushed, process.env, 'commit', '-q', '--allow-empty', '-m', 'pushed work')
  // What git exports to a pre-push hook run from a worktree.
  const hook = { ...process.env, GIT_DIR: join(pushed, '.git'), GIT_PREFIX: '' }
  const scratch = folder(t)

  const env = withoutRepositoryEnv(hook)
  git(scratch, env, 'init', '-q', '-b', 'main')
  git(scratch, env, 'commit', '-q', '--allow-empty', '-m', 'chore(orders): base')

  assert.deepEqual(git(pushed, process.env, 'log', '--format=%s').split('\n'), ['pushed work'])
  assert.equal(git(scratch, process.env, 'log', '--format=%s'), 'chore(orders): base')
  assert.equal(env.PATH, hook.PATH)
})

test('every variable git lists as locating a repository is dropped, whatever its case', () => {
  const listed = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
  const env = withoutRepositoryEnv({ ...Object.fromEntries(listed.map((name) => [name, 'x'])), git_work_tree: 'x', GIT_EDITOR: 'true', PATH: '/bin' })

  assert.deepEqual(listed.filter((name) => !REPOSITORY_ENV.includes(name)), [])
  assert.deepEqual(env, { GIT_EDITOR: 'true', PATH: '/bin' })
})
