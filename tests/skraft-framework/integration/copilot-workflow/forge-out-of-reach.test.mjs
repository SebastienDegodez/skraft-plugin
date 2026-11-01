import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, answeringSession, copilotHost, settled, simulatedContext, workingCopy, writesNothing } from './simulated-host.mjs'
import { withoutAz } from '../support/without-az.mjs'

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const NO_GH = 'gh, the GitHub CLI, is not installed'

/** A working copy on github.com whose publish consent is kept, with its first commit. @param {import('node:test').TestContext} t */
const consentedOnGithub = async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify(CONSENTED))
  for (const argv of [['init', '-q', '-b', 'main'], ['remote', 'add', 'origin', 'https://github.com/acme/shop.git'], ['add', '.'], ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init']]) {
    assert.equal(spawnSync('git', argv, { cwd }).status, 0, argv.join(' '))
  }
  return cwd
}

test('a run whose publish consent is kept, on a PATH without gh, asks in the session to fix the machine before any agent, with gh\'s fixed reason', async (t) => {
  const cwd = await consentedOnGithub(t)
  await withoutAz(t)
  const session = answeringSession()
  const { ctx, calls } = simulatedContext({ args: { slug: 'refund' }, behaviours: [writesNothing] })

  await settled(runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session)))

  assert.deepEqual(calls, [])
  assert.equal(session.asked.length, 1, JSON.stringify(session.asked))
  assert.equal(session.asked[0].message, `publish_consent cannot run on this machine: ${NO_GH}. Fix it, then RETRY; or ABORT the run.`)
  assert.deepEqual(session.asked[0].options, ['RETRY', 'ABORT'])
})
