import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { copilotHost, journalEvents, simulatedContext, workingCopy } from './simulated-host.mjs'

const UNEXPECTED = 'the run stopped on an unexpected error; nothing past the last journaled step was done, and the run can be started again'

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

test('a run whose signal is aborted rethrows what stopped it, and returns no outcome', async (t) => {
  const cwd = await unjournalable(t)
  const controller = new AbortController()
  controller.abort()
  const { ctx, logs } = simulatedContext({ args: { slug: 'checkout' }, signal: controller.signal })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd)), { code: 'ENOTDIR' })
  assert.deepEqual(logs, [])
})

test('an agent call the host cancels stops the run there: the cancellation is rethrown and no agent failure is journaled', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const controller = new AbortController()
  const { ctx, calls } = simulatedContext({ args: { slug: 'checkout' }, signal: controller.signal, behaviours: [cancelledBy(controller)] })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd)), { name: 'AbortError' })

  assert.equal(calls.length, 1)
  const events = await journalEvents(cwd, 'checkout')
  assert.deepEqual(events.filter((event) => event.type === 'step.recorded'), [])
  assert.equal(events.at(-1).type, 'step.started')
})
