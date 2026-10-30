import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, answeringSession, copilotHost, journalEvents, settled, simulatedContext, stops, workingCopy } from './simulated-host.mjs'

const SLUG = 'refund'
const QUESTION = 'Start this run with the configuration of this working copy? The Configuration tab of the skraft canvas and skraft doctor show it. ' +
  'START goes on, and is kept in skraft-config.local.json (configurationConfirmed) so that later runs start without asking; STOP starts nothing.'
const LOCAL = 'skraft-config.local.json'
const OPENED = Object.freeze({ canvasId: 'skraft-pipeline', instanceId: 'skraft-run', input: { tab: 'configuration' } })

/** A working copy nobody confirmed the configuration of: its skraft-config.local.json removed. */
const unconfirmed = async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  rmSync(join(cwd, LOCAL), { force: true })
  return cwd
}

/** A joined session whose person answers in turn, and whose canvas opens keep each request. */
const session = (answers) => {
  const joined = answeringSession({ answers })
  const opens = []
  joined.rpc.canvas = { open: async (request) => { opens.push(request) } }
  return { joined, opens }
}

const answered = async (cwd) => (await journalEvents(cwd, SLUG)).filter(({ type }) => type === 'question.answered').map(({ key, answer, by }) => [key, answer, by])

test('a run in a working copy whose configuration nobody confirmed opens the canvas on its Configuration tab, then asks once in the chat; START is kept and the run goes on', async (t) => {
  const cwd = await unconfirmed(t)
  const { joined, opens } = session(['START'])
  const { ctx, calls } = simulatedContext({ args: { slug: SLUG }, behaviours: [stops()] })

  await settled(runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, joined)))

  assert.deepEqual(opens, [OPENED])
  assert.deepEqual(joined.asked[0], { kind: 'select', message: QUESTION, options: ['START', 'STOP'] })
  assert.deepEqual((await answered(cwd))[0], ['configuration-1', 'START', 'host-confirmed'])
  assert.deepEqual(JSON.parse(readFileSync(join(cwd, LOCAL), 'utf8')), { configurationConfirmed: true })
  assert.deepEqual(calls.map(({ agent }) => agent), ['skraft:solution-researcher'])
})

test('a canvas the host cannot open leaves the question in the chat, which names the tab', async (t) => {
  const cwd = await unconfirmed(t)
  const { joined } = session(['START'])
  joined.rpc.canvas = { open: async () => { throw new Error('canvas.open is not supported') } }
  const { ctx, calls } = simulatedContext({ args: { slug: SLUG }, behaviours: [stops()] })

  await settled(runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, joined)))

  assert.deepEqual([joined.asked[0].message, calls.length], [QUESTION, 1])
})

test('STOP starts nothing: the run ends refused, says why, and the next start asks again', async (t) => {
  const cwd = await unconfirmed(t)
  const { joined } = session(['STOP'])
  const { ctx, calls, logs } = simulatedContext({ args: { slug: SLUG } })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, joined))

  const reason = 'you chose not to start with this configuration; change it in the Configuration tab of the skraft canvas or in skraft-config.json, then start the pipeline again'
  assert.deepEqual(outcome, { status: 'refused', slug: SLUG, phase: null, code: 'configuration-stopped', reason })
  assert.deepEqual([calls, logs.at(-1)], [[], `${SLUG}: refused (configuration-stopped): ${reason}`])
  assert.deepEqual(await answered(cwd), [['configuration-1', 'STOP', 'host-confirmed']])
})

test('a confirmed working copy starts without the canvas or the question; configure asks again at this start', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const quiet = session([])
  await settled(runSkraftPipelineWorkflow(simulatedContext({ args: { slug: SLUG }, behaviours: [stops()] }).ctx, copilotHost(cwd, PLUGIN_ROOT, quiet.joined)))
  assert.deepEqual([quiet.opens, quiet.joined.asked.map(({ message }) => message).includes(QUESTION)], [[], false])

  const again = session(['START'])
  await settled(runSkraftPipelineWorkflow(simulatedContext({ args: { configure: true }, behaviours: [stops()] }).ctx, copilotHost(cwd, PLUGIN_ROOT, again.joined)))
  assert.deepEqual([again.opens, again.joined.asked[0].message], [[OPENED], QUESTION])
})

test('without a person to ask, the run pauses on the question before anything starts; configure must be true or false', async (t) => {
  const cwd = await unconfirmed(t)
  const { ctx, calls } = simulatedContext({ args: { slug: SLUG } })

  assert.deepEqual(await settled(runSkraftPipelineWorkflow(ctx, copilotHost(cwd))), { paused: 'configuration-1' })
  assert.deepEqual(calls, [])

  const refused = await runSkraftPipelineWorkflow(simulatedContext({ args: { configure: 'yes' } }).ctx, copilotHost(cwd))
  assert.deepEqual([refused.status, refused.code], ['refused', 'invalid-args'])
})
