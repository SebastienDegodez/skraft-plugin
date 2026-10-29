import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createSkraftDecideTool } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-decide-tool.mjs'
import { createHostConfirmation } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/host-confirmation.mjs'
import { PLUGIN_ROOT, copilotHost, eventsPath, firstOptionPerson, simulatedContext, workingCopy, writesNothing, decideTool } from './simulated-host.mjs'

const decide = (cwd) => decideTool(cwd)

test('skraft_decide takes no argument: the model chooses neither the question nor the answer', () => {
  const tool = decide('.')
  assert.equal(tool.name, 'skraft_decide')
  assert.deepEqual(tool.parameters, { type: 'object', properties: {}, additionalProperties: false })
})

test('skraft_decide refuses without an active pipeline and creates nothing', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const answer = await decide(cwd).handler({})
  assert.equal(answer, 'Refused: no question is waiting (the active pipeline is idle); nothing was recorded.')
  assert.equal(existsSync(join(cwd, '.copilot-tracking')), false)
})

test('skraft_decide answers a tracking folder the machine cannot read with a fixed refusal, never the error text and its path', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  await mkdir(join(cwd, '.copilot-tracking', 'skraft-plans', '.active-slug'), { recursive: true })

  const answer = await decide(cwd).handler({})

  assert.equal(answer, 'Refused: skraft could not read or write its tracking folder on this machine; nothing was recorded.')
})

test('skraft_decide asks nothing when the active pipeline waits on no question, nor when its journal was tampered with', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [writesNothing, writesNothing] })
  await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))
  const session = firstOptionPerson()

  assert.equal(await decideTool(cwd, session).handler({}), 'Refused: no question is waiting (the active pipeline is blocked); nothing was recorded.')

  await writeFile(eventsPath(cwd, 'checkout'), '{"type":"run.started","prev":"x"}\n', 'utf8')
  assert.equal(await decideTool(cwd, session).handler({}), 'Refused: no question is waiting (the active pipeline is tampered); nothing was recorded.')
  assert.deepEqual(session.asked, [])
})

test('skraft_decide reads the session\'s directory on each call: with none known yet, it asks nothing', async () => {
  const session = firstOptionPerson()
  const tool = createSkraftDecideTool({ directory: () => null, pluginRoot: PLUGIN_ROOT, home: '.', dialog: createHostConfirmation({ session: () => session }) })

  assert.equal(await tool.handler({}), 'Refused: the session has no working directory yet; nothing was recorded.')
  assert.deepEqual(session.asked, [])
})
