import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createNodeAdapters } from '../../../../plugins/skraft-deliver/engine/infrastructure/node-adapters.mjs'
import { createMergedRepository } from '../../../../plugins/skraft-deliver/engine/infrastructure/architecture/merged-repository.mjs'
import { createConfigureComponents } from '../../../../plugins/skraft-deliver/engine/application/config/configure-components-usecase.mjs'

const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

const cloneWith = async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skraft deliver setup ')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const origin = join(root, 'origin.git')
  const seed = join(root, 'seed')
  const work = join(root, 'work')
  git(root, 'init', '--bare', '--initial-branch=main', origin)
  git(root, 'clone', '--quiet', origin, seed)
  writeFileSync(join(seed, '.gitignore'), 'target/\n')
  writeFileSync(join(seed, 'README.md'), 'hello\n')
  writeFileSync(join(seed, 'package.json'), '{"name":"shop","scripts":{"test":"node --test"}}\n')
  git(seed, 'add', '.')
  git(seed, 'commit', '-m', 'init')
  git(seed, 'push', 'origin', 'HEAD:main')
  git(root, 'clone', '--quiet', origin, work)
  const adapters = createNodeAdapters({ cwd: work, pluginRoot: join(root, 'plugin'), home: join(root, 'home') })
  return { work, adapters, repository: createMergedRepository({ ...adapters, base: 'main' }) }
}

test('a run branch starts after setup listed what it ignores in .gitignore', async (t) => {
  const { adapters, repository } = await cloneWith(t)
  const configured = await createConfigureComponents(adapters).configure({ workingCopyName: 'work' })
  assert.equal(configured.ok, true, configured.reason)
  const branched = await repository.branch({ name: 'deliver/issue-7', existing: false })
  assert.deepEqual(branched, { ok: true })
})

test('a run branch still refuses any other tracked change, .gitignore included', async (t) => {
  const { work, repository } = await cloneWith(t)
  appendFileSync(join(work, '.gitignore'), 'skraft-deliver-config.local.json\nsecrets/\n')
  assert.equal((await repository.branch({ name: 'deliver/issue-7', existing: false })).code, 'architecture-repository-unavailable')
  git(work, 'checkout', '--', '.gitignore')
  appendFileSync(join(work, 'README.md'), 'edit\n')
  assert.equal((await repository.branch({ name: 'deliver/issue-7', existing: false })).code, 'architecture-repository-unavailable')
})
