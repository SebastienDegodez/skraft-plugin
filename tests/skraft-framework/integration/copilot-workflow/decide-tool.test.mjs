import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSkraftDecideTool } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-decide-tool.mjs'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, eventsPath, simulatedContext, workingCopy, writesNothing } from './simulated-host.mjs'

const decide = (cwd) => createSkraftDecideTool({ cwd, pluginRoot: PLUGIN_ROOT })

test('skraft_decide asks for the key and the verbatim answer', () => {
  const tool = decide('.')
  assert.equal(tool.name, 'skraft_decide')
  assert.deepEqual(tool.parameters.required, ['key', 'answer'])
  assert.deepEqual(Object.keys(tool.parameters.properties), ['key', 'answer'])
})

test('skraft_decide refuses without an active pipeline and creates nothing', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const answer = await decide(cwd).handler({ key: 'adr', answer: 'A' })
  assert.match(answer, /^Refused: no active pipeline in this working copy/)
  assert.equal(existsSync(join(cwd, '.copilot-tracking')), false)
})

test('skraft_decide says the active pipeline has no pending question', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [writesNothing, writesNothing] })
  await runSkraftPipelineWorkflow(ctx, { cwd, pluginRoot: PLUGIN_ROOT })

  assert.equal(await decide(cwd).handler({ key: 'adr', answer: 'A' }), 'Refused: checkout has no pending question; nothing was recorded.')

  await writeFile(eventsPath(cwd, 'checkout'), '{"type":"run.started","prev":"x"}\n', 'utf8')
  assert.match(await decide(cwd).handler({ key: 'adr', answer: 'A' }), /^Refused: journal tampered: events.jsonl line 1/)
})
