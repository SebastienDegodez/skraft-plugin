import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, actsAs, copilotHost, firstOptionPerson, journalEvents, simulatedContext, workingCopy } from './simulated-host.mjs'
import { SLUG, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { git } from '../support/workspace.mjs'

const UNEXPECTED = 'the run stopped on an unexpected error; start the pipeline again to resume it from its journal'

/** A working copy whose tracking folder is a file: the journal cannot be written. */
const unjournalable = async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  writeFileSync(join(cwd, '.copilot-tracking'), 'not a folder\n')
  return cwd
}

/** An agent call the host cancels, as Copilot does: the run's signal aborts, the call rejects with its reason. */
const cancelledBy = (controller) => async () => {
  controller.abort(new DOMException('Workflow run was aborted', 'AbortError'))
  throw controller.signal.reason
}

test('a run the engine fails under ends with an error outcome, every key present, and no exception text in it or in the log', async (t) => {
  const cwd = await unjournalable(t)
  const { ctx, logs, calls } = simulatedContext({ args: { slug: 'checkout' } })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  assert.deepEqual(outcome, { status: 'error', slug: null, phase: null, code: 'unexpected', reason: UNEXPECTED })
  assert.deepEqual(logs, [`skraft: error (unexpected): ${UNEXPECTED}`])
  assert.deepEqual(calls, [])
})

test('a run that fails after it started journals that it stopped on an unexpected error, with a fixed reason, and can be resumed', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx, calls } = simulatedContext({ args: { slug: 'checkout' } })
  ctx.log = (message) => { if (message.startsWith('phase ')) throw new Error(`log closed ${cwd}`) }

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  assert.deepEqual(outcome, { status: 'error', slug: 'checkout', phase: null, code: 'unexpected', reason: UNEXPECTED })
  assert.deepEqual(calls, [])
  const last = (await journalEvents(cwd, 'checkout')).at(-1)
  assert.deepEqual([last.type, last.code, last.reason], ['run.stopped', 'unexpected', UNEXPECTED])
})

test('a run whose signal is aborted rethrows what stopped it, and returns no outcome', async (t) => {
  const cwd = await unjournalable(t)
  const controller = new AbortController()
  controller.abort()
  const { ctx, logs } = simulatedContext({ args: { slug: 'checkout' }, signal: controller.signal })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd)), { code: 'ENOTDIR' })
  assert.deepEqual(logs, [])
})

/** How long a run may write nothing to its journal before the test takes it for hung. */
const STILL_MS = 30_000

/** The size of the run's journal, which grows while the run moves. @param {string} cwd */
const journalSize = (cwd) => statSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'events.jsonl'), { throwIfNoEntry: false })?.size ?? 0

test('a run the host cancels while a gate runs ends that command with every process it started', { skip: process.platform === 'win32' && 'Windows ends only the direct child (a written limit)', timeout: 120_000 }, async (t) => {
  const { cwd } = pipelineRepository(t)
  const marker = join(cwd, 'mutation.pid')
  const hang = `const { spawn } = require('node:child_process'); const sleeper = spawn('sleep', ['300'], { stdio: 'ignore' }); require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(sleeper.pid)); setInterval(() => {}, 1000)\n`
  writeFileSync(join(cwd, 'tools', 'hang.cjs'), hang)
  const config = JSON.parse(readFileSync(join(cwd, 'skraft-config.json'), 'utf8'))
  config.components[0].commands.mutation = `"${process.execPath}" tools/hang.cjs`
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify(config, null, 2))
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '-m', 'chore: a mutation command that never ends')
  const controller = new AbortController()
  const { ctx } = simulatedContext({ args: { slug: SLUG }, signal: controller.signal, otherwise: actsAs(scriptedLlm({ cwd })) })
  let running = true
  // The run goes through every phase before its mutation gate: a loaded machine makes it slow, not
  // still. It is cancelled once the gate's command started, once it ended, or once its journal
  // stood still for STILL_MS: a run hung before the gate fails the test then, however long the
  // phases before took.
  const cancelOnceRunning = (async () => {
    let [size, moved] = [journalSize(cwd), Date.now()]
    while (running && !t.signal.aborted && !existsSync(marker) && Date.now() - moved < STILL_MS) {
      await new Promise((done) => setTimeout(done, 50))
      if (journalSize(cwd) !== size) [size, moved] = [journalSize(cwd), Date.now()]
    }
    controller.abort(new DOMException('Workflow run was aborted', 'AbortError'))
  })()

  const ended = await runAnsweringQuestions(ctx, cwd).catch((error) => error).finally(() => { running = false })
  await cancelOnceRunning

  assert.equal(existsSync(marker), true, 'the run ended or stood still before its mutation gate started')
  assert.equal(ended.name, 'AbortError')
  const sleeper = Number(readFileSync(marker, 'utf8'))
  let alive = true
  for (const deadline = Date.now() + 10_000; alive && Date.now() < deadline; await new Promise((done) => setTimeout(done, 50))) {
    try { process.kill(sleeper, 0) } catch { alive = false }
  }
  assert.equal(alive, false)
})

/** Runs the workflow to its end, the person answering each question with its first option. */
const runAnsweringQuestions = (ctx, cwd) => runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, firstOptionPerson()))

test('an AbortError from an agent call while the run goes on is that agent\'s failure, not a cancellation', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const aborts = async () => { throw new DOMException('This operation was aborted', 'AbortError') }
  const { ctx } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [aborts] })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  assert.deepEqual([outcome.status, outcome.code], ['blocked', 'agent-failed'])
})

test('an agent call the host cancels stops the run there: the cancellation is rethrown and no agent failure is journaled', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const controller = new AbortController()
  const { ctx, calls } = simulatedContext({ args: { slug: 'checkout' }, signal: controller.signal, behaviours: [cancelledBy(controller)] })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd)), { name: 'AbortError' })

  assert.equal(calls.length, 1)
  const events = await journalEvents(cwd, 'checkout')
  assert.deepEqual(events.filter((event) => event.type === 'step.recorded' && !event.step.endsWith('_consent')), [])
  assert.equal(events.at(-1).type, 'step.started')
})
