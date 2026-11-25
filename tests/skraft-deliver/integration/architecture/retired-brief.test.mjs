import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createNodeAdapters } from '../../../../plugins/skraft-deliver/engine/infrastructure/node-adapters.mjs'

const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test('a retired brief leaves the working copy in one commit of its own, its run folder gone with it, the rest kept', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skraft deliver retire ')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const work = join(root, 'work')
  git(root, 'init', '--quiet', '--initial-branch=main', work)
  git(work, 'config', 'user.name', 't')
  git(work, 'config', 'user.email', 't@example.test')
  mkdirSync(join(work, 'docs/architecture/runs/epic-1'), { recursive: true })
  writeFileSync(join(work, 'docs/architecture/runs/epic-1/42-checkout.md'), '# brief\n')
  writeFileSync(join(work, 'docs/architecture/context-map.md'), '# map\n')
  writeFileSync(join(work, 'notes.md'), 'draft\n')
  git(work, 'add', 'docs')
  git(work, 'commit', '--quiet', '-m', 'design')
  const { sourceControl } = createNodeAdapters({ cwd: work, pluginRoot: join(root, 'plugin'), home: join(root, 'home') })
  const retired = await sourceControl.retireFiles('.', ['docs/architecture/runs/epic-1/42-checkout.md'], 'docs(issue-42): retire the architecture brief this story delivers')
  assert.deepEqual(retired, { ok: true })
  assert.equal(git(work, 'log', '-1', '--format=%s'), 'docs(issue-42): retire the architecture brief this story delivers')
  assert.equal(git(work, 'show', '--name-status', '--format=', 'HEAD'), 'D\tdocs/architecture/runs/epic-1/42-checkout.md')
  assert.equal(existsSync(join(work, 'docs/architecture/runs/epic-1')), false)
  assert.equal(git(work, 'status', '--porcelain'), '?? notes.md')
})
