import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createNodeAdapters } from '../../../../plugins/skraft-design/engine/infrastructure/node-adapters.mjs'
import { createMergedRepository } from '../../../../plugins/skraft-design/engine/infrastructure/architecture/merged-repository.mjs'

const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

const cloneWith = async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skraft design setup ')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const origin = join(root, 'origin.git')
  const seed = join(root, 'seed')
  const work = join(root, 'work')
  git(root, 'init', '--bare', '--initial-branch=main', origin)
  git(root, 'clone', '--quiet', origin, seed)
  writeFileSync(join(seed, '.gitignore'), 'target/\n')
  writeFileSync(join(seed, 'README.md'), 'hello\n')
  git(seed, 'add', '.')
  git(seed, 'commit', '-m', 'init')
  git(seed, 'push', 'origin', 'HEAD:main')
  git(root, 'clone', '--quiet', origin, work)
  const adapters = createNodeAdapters({ cwd: work, pluginRoot: join(root, 'plugin'), home: join(root, 'home') })
  return { work, repository: createMergedRepository({ ...adapters, base: 'main' }) }
}

test('a run branch starts after setup listed the local configuration in .gitignore', async (t) => {
  const { work, repository } = await cloneWith(t)
  appendFileSync(join(work, '.gitignore'), 'skraft-design-config.local.json\n')
  const branched = await repository.branch({ name: 'design/epic-7', existing: false })
  assert.deepEqual(branched, { ok: true })
})

test('a run branch still refuses any other tracked change, .gitignore included', async (t) => {
  const { work, repository } = await cloneWith(t)
  appendFileSync(join(work, '.gitignore'), 'skraft-design-config.local.json\nsecrets/\n')
  assert.equal((await repository.branch({ name: 'design/epic-7', existing: false })).code, 'architecture-repository-unavailable')
  git(work, 'checkout', '--', '.gitignore')
  appendFileSync(join(work, 'README.md'), 'edit\n')
  assert.equal((await repository.branch({ name: 'design/epic-7', existing: false })).code, 'architecture-repository-unavailable')
})
