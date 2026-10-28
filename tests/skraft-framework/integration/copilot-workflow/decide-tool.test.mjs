import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, copilotHost, eventsPath, simulatedContext, workingCopy, writesNothing, decideTool } from './simulated-host.mjs'

const decide = (cwd) => decideTool(cwd)

test('skraft_decide asks for the key, the answer, and a reason with a refusal', () => {
  const tool = decide('.')
  assert.equal(tool.name, 'skraft_decide')
  assert.deepEqual(tool.parameters.required, ['key', 'answer'])
  assert.deepEqual(Object.keys(tool.parameters.properties), ['key', 'answer', 'reason'])
})

test('skraft_decide refuses without an active pipeline and creates nothing', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const answer = await decide(cwd).handler({ key: 'adr', answer: 'A' })
  assert.match(answer, /^Refused: no active pipeline in this working copy/)
  assert.equal(existsSync(join(cwd, '.copilot-tracking')), false)
})

test('skraft_decide answers a tracking folder the machine cannot read with a fixed refusal, never the error text and its path', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  await mkdir(join(cwd, '.copilot-tracking', 'skraft-plans', '.active-slug'), { recursive: true })

  const answer = await decide(cwd).handler({ key: 'adr', answer: 'A' })

  assert.equal(answer, 'Refused: skraft could not read or write its tracking folder on this machine; nothing was recorded.')
})

test('skraft_decide refuses a key the active pipeline does not wait on, and a tampered journal', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [writesNothing, writesNothing] })
  await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  assert.equal(await decide(cwd).handler({ key: 'adr-1', answer: 'RATIFIED' }), 'Refused: no question has that key; no question is waiting; nothing was recorded.')
  assert.equal(await decide(cwd).handler({ key: 7, answer: 'RATIFIED' }), 'Refused: no question to answer; no question is waiting; nothing was recorded.')

  await writeFile(eventsPath(cwd, 'checkout'), '{"type":"run.started","prev":"x"}\n', 'utf8')
  assert.match(await decide(cwd).handler({ key: 'adr', answer: 'A' }), /^Refused: journal tampered: events.jsonl line 1/)
})
