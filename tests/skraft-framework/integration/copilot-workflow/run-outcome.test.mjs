import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, actsAs, copilotHost, firstOptionPerson, journalEvents, settled, simulatedContext, workingCopy } from './simulated-host.mjs'
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

test('a run that fails after it started journals that it stopped on an unexpected error with a fixed reason, keeps the exception in a log of its folder the outcome names, and can be resumed', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx, calls } = simulatedContext({ args: { slug: 'checkout' } })
  ctx.log = (message) => { if (message.startsWith('phase ')) throw new Error(`log closed ${cwd}`) }
  const log = join(cwd, '.copilot-tracking', 'skraft-plans', 'checkout', 'logs', 'unexpected.log')

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  assert.deepEqual(outcome, { status: 'error', slug: 'checkout', phase: null, code: 'unexpected', reason: `${UNEXPECTED}; the error is in ${log}` })
  assert.deepEqual(calls, [])
  const last = (await journalEvents(cwd, 'checkout')).at(-1)
  assert.deepEqual([last.type, last.code, last.reason], ['run.stopped', 'unexpected', UNEXPECTED])
  assert.match(readFileSync(log, 'utf8'), /^Error: log closed /, 'the log holds the exception and its stack, which the journal never does')
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
/** Runs the workflow to its end, the person answering each question with its first option. */
const runAnsweringQuestions = (ctx, cwd) => runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, firstOptionPerson()))

test('an AbortError from an agent call while the run goes on is that agent\'s failure, not a cancellation: the run asks for its recovery', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const aborts = async () => { throw new DOMException('This operation was aborted', 'AbortError') }
  const { ctx } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [aborts] })

  assert.deepEqual(await settled(runSkraftPipelineWorkflow(ctx, copilotHost(cwd))), { paused: 'research-1' })

  const asked = (await journalEvents(cwd, 'checkout')).filter(({ type }) => type === 'question.asked').at(-1)
  assert.deepEqual([asked.kind, asked.incidents[0].category], ['unforeseen', 'agent-failed'])
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
