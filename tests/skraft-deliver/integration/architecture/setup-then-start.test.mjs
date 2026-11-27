import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

test('CI consent and repeated setup leave an existing team configuration unchanged', async (t) => {
  const { work } = await cloneWith(t)
  const config = '{"components":[{"name":"web","root":".","stack":"react","paths":{"src":["src"],"tests":["tests"]},"commands":{"test":"npm test"},"bdd":true}]}\n'
  writeFileSync(join(work, 'skraft-deliver-config.json'), config)
  git(work, 'add', 'skraft-deliver-config.json')
  git(work, 'commit', '-m', 'configure delivery')
  git(work, 'remote', 'set-url', 'origin', 'https://github.com/acme/shop.git')
  const home = join(dirname(work), 'home')
  const driver = fileURLToPath(new URL('../../../../plugins/skraft-deliver/engine/drivers/cli/standalone-run.mjs', import.meta.url))
  const consent = fileURLToPath(new URL('../../../../plugins/skraft-deliver/engine/drivers/cli/ci-consent.mjs', import.meta.url))
  const plugin = fileURLToPath(new URL('../../../../plugins/skraft-deliver', import.meta.url))
  const env = { ...process.env, HOME: home, USERPROFILE: home }
  const first = spawnSync(process.execPath, [consent], { cwd: work, encoding: 'utf8', env })
  assert.equal(first.status, 0, first.stdout + first.stderr)
  assert.equal(readFileSync(join(work, 'skraft-deliver-config.json'), 'utf8'), config, 'CI consent must not change the team configuration')
  const script = `import { runStandalone } from ${JSON.stringify(pathToFileURL(driver).href)}; process.exitCode = await runStandalone(['setup', '{}'], { cwd: process.cwd(), pluginFolder: () => ${JSON.stringify(plugin)} }, { out: console.log })`
  const repeated = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: work, encoding: 'utf8', env })
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr)
  assert.equal(readFileSync(join(work, 'skraft-deliver-config.json'), 'utf8'), config, 'repeated setup must not reformat the team configuration')
  const local = JSON.parse(readFileSync(join(work, 'skraft-deliver-config.local.json'), 'utf8'))
  assert.equal(local.publish.pullRequest, true)
})
