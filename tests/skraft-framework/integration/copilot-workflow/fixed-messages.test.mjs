import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, actsAs, copilotHost, eventsPath, firstOptionPerson, settled, simulatedContext, trackingDir, workingCopy } from './simulated-host.mjs'
import { SENTINEL } from './simulated-sdk.mjs'
import { SLUG, WRONG_PAY, deliverWith, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'

/** Every place a model or the person reads: the outcome, the workflow log, the journal, each prompt and each tool result or dialog. */
const modelFacing = ({ outcome, logs, calls, cwd, slug, toolResults = [] }) => [
  JSON.stringify(outcome), ...logs, readFileSync(eventsPath(cwd, slug), 'utf8'), ...calls.map((call) => call.prompt), ...toolResults,
].join('\n')

/** The text of every evidence log the gates wrote for the slug. */
const evidenceLogs = (cwd, slug) => {
  const dir = join(trackingDir(cwd, slug), 'gates')
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8')).join('\n')
}

test('the text of an error a Copilot agent call throws reaches neither the outcome, the log, the journal nor a prompt', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const throws = async () => { throw new Error(`${SENTINEL} at /home/someone/.ssh/id_rsa`) }
  const { ctx, logs, calls } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [throws] })

  const outcome = await settled(runSkraftPipelineWorkflow(ctx, copilotHost(cwd)))

  assert.deepEqual(outcome, { paused: 'research-1' })
  assert.equal(modelFacing({ outcome, logs, calls, cwd, slug: 'checkout' }).includes(SENTINEL), false)
})
