import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { copilotHost, workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { contentStream, pipelineCanvas, tokenOf } from './canvas-host.mjs'

/** A working copy whose active pipeline `slug` was just started; home: the person's, else the working copy's own. */
const started = async (t, slug, home) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const adapters = createNodeAdapters({ ...copilotHost(cwd), ...(home === undefined ? {} : { home }) })
  assert.equal((await createInit(adapters).init({ slug })).ok, true)
  return { cwd, journal: /** @type {any} */ (await openJournal(adapters, slug)).journal }
}

test('an open page gets the new content when the run moves, and the pipeline of the directory the session moved to, without reopening', async (t) => {
  const first = await started(t, 'checkout')
  const second = await started(t, 'refund', `${first.cwd}-home`)
  const where = { cwd: first.cwd }
  const { open } = pipelineCanvas(t, { directory: () => where.cwd, home: `${first.cwd}-home` })
  const { url } = await open()
  const stream = contentStream(t, url, await tokenOf(url))
  assert.deepEqual([(await stream.next()).title, stream.received.length], ['skraft checkout', 1])

  await first.journal.append('question.asked', { key: 'adr-1', kind: 'adr-ratification', text: 'Ratify?', options: ['RATIFIED', 'REJECTED'], refusals: ['REJECTED'], header: 'ADR', step: 'adr', visit: 1, subjects: [] })
  const waiting = await stream.next()
  assert.deepEqual([waiting.title, waiting.status, waiting.question?.key], ['skraft checkout', 'waiting', 'adr-1'])

  where.cwd = second.cwd
  const moved = await stream.next()
  assert.deepEqual([moved.title, moved.status, moved.question], ['skraft refund', 'running', null])
})

test('a content that did not change is not sent again', async (t) => {
  const { cwd } = await started(t, 'checkout')
  const { open } = pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` })
  const { url } = await open()
  const stream = contentStream(t, url, await tokenOf(url))

  await stream.next()
  await new Promise((done) => setTimeout(done, 150))

  assert.equal(stream.received.length, 1)
})
