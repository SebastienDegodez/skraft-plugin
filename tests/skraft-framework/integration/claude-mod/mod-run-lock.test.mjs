import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createModRunLock } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/mod-run-lock.mjs'
import { createModFiles } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/mod-files.mjs'
import { PLUGIN_ROOT, nodeModFs, nodeModRun } from './support/scripted-mod-host.mjs'

const LEASE = 'session-a 2026-10-11T09:00:00.000Z 2026-10-11T09:00:00.000Z\n'

test('the mod lock writes through the engine\'s lock-file command under node, and reads through $.fs', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-mod-lock-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const lock = createModRunLock({ files: createModFiles(nodeModFs), run: nodeModRun, pluginRoot: PLUGIN_ROOT, root })

  assert.match(lock.owner, /^[0-9a-f]{32}$/)
  assert.notEqual(createModRunLock({ files: createModFiles(nodeModFs), run: nodeModRun, pluginRoot: PLUGIN_ROOT, root }).owner, lock.owner)
  assert.equal(await lock.read('checkout'), null)
  assert.equal(await lock.create('checkout', LEASE), true)
  assert.equal(await lock.create('checkout', LEASE), false)
  assert.equal(await readFile(join(root, '.copilot-tracking', 'skraft-plans', 'checkout', '.lock'), 'utf8'), LEASE)
  assert.equal(await lock.replace('checkout', 'other', 'x'), false)
  assert.equal(await lock.replace('checkout', LEASE, 'renewed "quoted" text\n'), true)
  assert.equal(await lock.read('checkout'), 'renewed "quoted" text\n')
  assert.equal(await lock.replace('checkout', 'renewed "quoted" text\n', null), true)
  assert.equal(await lock.read('checkout'), null)
})

test('a lock-file command that fails otherwise rejects, without its output', async () => {
  const calls = []
  const lock = createModRunLock({
    files: createModFiles(nodeModFs), pluginRoot: '/plugin', root: '/work', owner: 'session-a',
    run: async (argv) => {
      calls.push(argv)
      return { exitCode: 1, stdout: '', stderr: 'Error: EACCES /work/secret' }
    },
  })

  await assert.rejects(lock.create('checkout', 'a b'), { message: 'the pipeline\'s lock file could not be written (node exited 1)' })
  assert.deepEqual(calls, [['node', '/plugin/engine/infrastructure/tracking/lock-file-command.mjs', 'create', '/work/.copilot-tracking/skraft-plans/checkout/.lock', 'a%20b']])
})
