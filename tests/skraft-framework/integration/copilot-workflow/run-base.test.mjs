import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, copilotHost, fillsOutputs, settled, simulatedContext, stops } from './simulated-host.mjs'
import { commitAll, git, journal, tempFolder } from '../support/workspace.mjs'

/** A working copy on a feature branch, with `develop` and `main` behind it, and a front in a neighbour repository. */
const repositories = (t) => {
  const root = tempFolder(t)
  const cwd = join(root, 'payment-api')
  mkdirSync(cwd)
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify({ publish: { pullRequest: false, visuals: false }, components: [{ name: 'web', root: '../payment-web', stack: 'react', baseBranch: 'develop' }] }))
  writeFileSync(join(cwd, 'skraft-config.local.json'), JSON.stringify({ configurationConfirmed: true }))
  writeFileSync(join(cwd, '.gitignore'), '.copilot-tracking/\nskraft-config.local.json\n')
  const main = commitAll(cwd)
  git(cwd, 'checkout', '-q', '-b', 'develop')
  writeFileSync(join(cwd, 'notes.md'), 'develop\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '-m', 'develop')
  const develop = git(cwd, 'rev-parse', 'HEAD')
  git(cwd, 'checkout', '-q', '-b', 'feature/pay')
  const web = join(root, 'payment-web')
  mkdirSync(web)
  writeFileSync(join(web, 'package.json'), '{}\n')
  const webMain = commitAll(web)
  git(web, 'branch', 'develop')
  return { cwd, main, develop, webMain }
}

test('the workflow journals the base of each repository when it starts a slug, and args.base wins', async (t) => {
  const { cwd, main, develop, webMain } = repositories(t)

  const plain = simulatedContext({ args: { slug: 'checkout' }, behaviours: [fillsOutputs(), stops()] })
  assert.deepEqual(await settled(runSkraftPipelineWorkflow(plain.ctx, copilotHost(cwd))), { paused: 'design-1' })
  assert.deepEqual(journal(cwd, 'checkout')[0].base.map(({ component, ref, source, sha }) => [component, ref, source, sha]), [
    [null, 'main', 'default', main],
    ['web', 'develop', 'component', webMain],
  ])

  const flagged = simulatedContext({ args: { slug: 'refund', base: 'develop' }, behaviours: [fillsOutputs(), stops()] })
  assert.deepEqual(await settled(runSkraftPipelineWorkflow(flagged.ctx, copilotHost(cwd))), { paused: 'design-1' })
  assert.deepEqual(journal(cwd, 'refund')[0].base.map(({ component, ref, source, sha }) => [component, ref, source, sha]), [
    [null, 'develop', 'flag', develop],
    ['web', 'develop', 'flag', webMain],
  ])
})

test('a base Git cannot find refuses the workflow before any agent starts', async (t) => {
  const { cwd } = repositories(t)
  const { ctx, calls, logs } = simulatedContext({ args: { slug: 'checkout', base: 'release/9' } })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  assert.deepEqual([outcome.status, outcome.code], ['refused', 'base-unresolved'])
  assert.deepEqual(calls, [])
  assert.match(logs.at(-1), /^skraft: refused \(base-unresolved\): the working copy \(\.\) has no merge base with release\/9;/)
})
