import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fillsItsOutputs, scriptedModHost } from './support/scripted-mod-host.mjs'
import { createModCommandRunner } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/mod-processes.mjs'
import { commitAll, git, tempFolder } from '../support/workspace.mjs'

const repository = (t) => {
  const cwd = join(tempFolder(t), 'payment-api')
  mkdirSync(cwd)
  writeFileSync(join(cwd, '.gitignore'), '.copilot-tracking/\n')
  const main = commitAll(cwd)
  git(cwd, 'checkout', '-q', '-b', 'develop')
  writeFileSync(join(cwd, 'notes.md'), 'develop\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '-m', 'develop')
  const develop = git(cwd, 'rev-parse', 'HEAD')
  git(cwd, 'checkout', '-q', '-b', 'feature/pay')
  return { cwd, main, develop }
}

test('/skraft <slug> journals the merge base with main through $.process.run; --base <ref> picks another', async (t) => {
  const { cwd, main, develop } = repository(t)
  const mod = await scriptedModHost({ cwd, behaviours: [fillsItsOutputs(), fillsItsOutputs()] })

  assert.equal(await mod.command('checkout #42 Pay by card'), 'skraft checkout started — progress in the Skraft pane.')
  await mod.settled()
  assert.equal(await mod.command('refund --base develop'), 'skraft refund started — progress in the Skraft pane.')
  await mod.settled()

  const [checkout] = await mod.journal('checkout')
  const [refund] = await mod.journal('refund')
  assert.deepEqual(checkout.story, { issue: 42, title: 'Pay by card' })
  assert.deepEqual(checkout.base, [{ component: null, root: '.', repository: '.', ref: 'main', source: 'default', sha: main }])
  assert.deepEqual(refund.base, [{ component: null, root: '.', repository: '.', ref: 'develop', source: 'flag', sha: develop }])
})

test('the run_pipeline tool takes a base, and a base Git cannot find is refused before any spawn', async (t) => {
  const { cwd } = repository(t)
  const mod = await scriptedModHost({ cwd })

  const text = await mod.tool({ slug: 'checkout', base: 'release/9' })

  assert.equal(text, 'skraft checkout: not started — the working copy (.) has no merge base with release/9; set baseBranch in skraft-config.json or pass --base <ref>')
  assert.deepEqual(mod.spawns, [])
})

test('a mod host whose $.process.run cannot start git starts the run with no base', async (t) => {
  const mod = await scriptedModHost({ behaviours: [fillsItsOutputs()] })
  t.after(mod.cleanup)
  mod.host.run = async () => { throw new Error('process.run is not allowed') }

  await mod.command('checkout')
  await mod.settled()

  assert.deepEqual((await mod.journal('checkout'))[0].base, [])
})

test('$.process.run as the CommandRunner: cwd from the working copy, a refused start, and the 600 s timeout as a stop', async () => {
  const calls = []
  const runner = createModCommandRunner({
    root: '/work/payment-api',
    run: async (argv, init) => {
      calls.push({ argv, init })
      if (argv[0] === 'missing') throw new Error('$.process.run (skraft): missing: ENOENT')
      if (argv[0] === 'slow') throw new Error('$.process.run (skraft): slow: aborted: still running after 600000ms')
      return { exitCode: 3, stdout: 'out', stderr: 'err', isStdoutTruncated: false }
    },
  })

  assert.deepEqual(await runner.run({ argv: ['npm', 'test'], cwd: '../payment-web' }), { started: true, exitCode: 3, stdout: 'out', stderr: 'err' })
  assert.deepEqual(calls[0], { argv: ['npm', 'test'], init: { cwd: '/work/payment-api/../payment-web', timeoutMs: 600_000 } })
  assert.deepEqual(await runner.run({ argv: ['missing'], cwd: '.' }), { started: false, exitCode: null, stdout: '', stderr: '', error: 'missing could not be started: $.process.run (skraft): missing: ENOENT' })
  assert.deepEqual(await runner.run({ argv: ['slow'], cwd: '.' }), { started: true, exitCode: null, stdout: '', stderr: '', error: 'slow did not finish within 600 s' })
})
