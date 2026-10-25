import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/pipeline/observe-usecase.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { actsAs, copilotHost, decideTool, journalEvents, simulatedContext, workingCopy } from './simulated-host.mjs'
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
  const cancelOnceRunning = (async () => {
    while (!existsSync(marker)) await new Promise((done) => setTimeout(done, 50))
    controller.abort(new DOMException('Workflow run was aborted', 'AbortError'))
  })()

  const ended = await runAnsweringQuestions(ctx, cwd).catch((error) => error)
  await cancelOnceRunning

  assert.equal(ended.name, 'AbortError')
  const sleeper = Number(readFileSync(marker, 'utf8'))
  let alive = true
  for (const deadline = Date.now() + 3000; alive && Date.now() < deadline; await new Promise((done) => setTimeout(done, 50))) {
    try { process.kill(sleeper, 0) } catch { alive = false }
  }
  assert.equal(alive, false)
})

/** Runs the workflow, answering each question it pauses on with its first option, until it ends. */
const runAnsweringQuestions = async (ctx, cwd) => {
  for (;;) {
    try {
      return await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))
    } catch (error) {
      if (ctx.signal.aborted || error.name !== 'AbortError') throw error
      const { question } = await createObserve(createNodeAdapters(copilotHost(cwd))).view()
      await decideTool(cwd).handler({ key: question.key, answer: question.options[0] })
    }
  }
}

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
  assert.deepEqual(events.filter((event) => event.type === 'step.recorded' && event.step !== 'publish_consent'), [])
  assert.equal(events.at(-1).type, 'step.started')
})
