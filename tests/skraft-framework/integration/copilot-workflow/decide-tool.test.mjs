import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createSkraftDecideTool } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-decide-tool.mjs'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { inProcessServices, journal } from '../support/workspace.mjs'
import { PLUGIN_ROOT, copilotHost, eventsPath, firstOptionPerson, simulatedContext, workingCopy, writesNothing, decideTool } from './simulated-host.mjs'

const decide = (cwd) => decideTool(cwd)

const waitingForIncident = async (cwd) => {
  const adapters = inProcessServices(cwd).adapters()
  await createInit(adapters).init({ slug: 'checkout' })
  const opened = await openJournal(adapters, 'checkout')
  await opened.journal.append('question.asked', {
    key: 'gate-1', kind: 'unforeseen', text: 'Read the incident output.', options: ['RETRY', 'STOP'],
    refusals: [], header: 'Incident', step: 'gates', visit: 1, subjects: [],
  })
}

test('Copilot records a paused host judgment with its observed model and nano-AIU cost, not as a human reply', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  await waitingForIncident(cwd)
  const tool = decide(cwd)
  const pending = JSON.parse(await tool.handler({}))
  assert.match(pending.guidance, /host-llm/)
  const answer = await tool.handler({ key: 'gate-1', answer: 'RETRY', by: 'host-llm', model: 'observed-test-model', cost: 140000, costUnit: 'nano-AIU' })

  assert.match(answer, /^Recorded:/)
  const recorded = journal(cwd, 'checkout').at(-1)
  assert.deepEqual([recorded.by, recorded.model, recorded.cost, recorded.costUnit], ['host-llm', 'observed-test-model', 140000, 'nano-AIU'])
})

test('Copilot reports an invalid judgment as a recorded stop, not as nothing recorded', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  await waitingForIncident(cwd)

  const reply = await decide(cwd).handler({ key: 'gate-1', answer: 'SEND_TO:publish', by: 'host-llm', model: 'observed-test-model', cost: 0.02, costUnit: 'USD' })

  assert.match(reply, /^Stopped:/)
  assert.equal(reply.includes('nothing was recorded'), false)
  const recorded = journal(cwd, 'checkout').at(-1)
  assert.deepEqual([recorded.answer, recorded.by, recorded.cost], ['STOP', 'host-llm', 0.02])
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
  await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, firstOptionPerson()))
  const session = firstOptionPerson()

  assert.equal(await decideTool(cwd, session).handler({}), 'Refused: no question is waiting (the active pipeline is blocked); nothing was recorded.')

  await writeFile(eventsPath(cwd, 'checkout'), '{"type":"run.started","prev":"x"}\n', 'utf8')
  assert.equal(await decideTool(cwd, session).handler({}), 'Refused: no question is waiting (the active pipeline is tampered); nothing was recorded.')
  assert.deepEqual(session.asked, [])
})

test('skraft_decide reads the session\'s directory on each call: with none known yet, it asks nothing', async () => {
  const session = firstOptionPerson()
  const tool = createSkraftDecideTool({ directory: () => null, pluginRoot: PLUGIN_ROOT, home: '.' })

  assert.equal(await tool.handler({}), 'Refused: the session has no working directory yet; nothing was recorded.')
  assert.deepEqual(session.asked, [])
})
