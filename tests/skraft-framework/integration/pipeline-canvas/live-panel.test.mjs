import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { copilotHost, workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { BOUNDED, contentStream, pipelineCanvas, tokenOf } from './canvas-host.mjs'

/**
 * Resolves once `count()` stayed the same for `quietTicks` ticks in a row of a 25 ms timer, however
 * late each tick came: a loaded machine that starves the event loop for a second gives one tick,
 * not a quiet second, and a poll alive would have run before it (its timer is due earlier). Throws
 * past `deadlineMs`, so a slow machine waits longer instead of failing.
 * @param {() => number} count
 */
const settled = async (count, { quietTicks = 12, deadlineMs = 30_000 } = {}) => {
  const deadline = Date.now() + deadlineMs
  let last = count()
  let quiet = 0
  while (quiet < quietTicks) {
    if (Date.now() > deadline) throw new Error(`still reading after ${deadlineMs} ms`)
    await new Promise((done) => setTimeout(done, 25))
    quiet = count() === last ? quiet + 1 : 0
    last = count()
  }
  return last
}

/** A working copy whose active pipeline `slug` was just started; home: the person's, else the working copy's own. */
const started = async (t, slug, home) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const adapters = createNodeAdapters({ ...copilotHost(cwd), ...(home === undefined ? {} : { home }) })
  assert.equal((await createInit(adapters).init({ slug })).ok, true)
  return { cwd, journal: /** @type {any} */ (await openJournal(adapters, slug)).journal }
}

test('an open page gets the new content when the run moves, and the pipeline of the directory the session moved to, without reopening', BOUNDED, async (t) => {
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

test('a second page gets the content at once, though it did not change', BOUNDED, async (t) => {
  const { cwd } = await started(t, 'checkout')
  const { open } = pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home`, more: { pollMs: 60_000 } })
  const { url } = await open()
  const token = await tokenOf(url)
  await contentStream(t, url, token).next()

  assert.equal((await contentStream(t, url, token).next()).title, 'skraft checkout')
})

test('the panel reads the content while a page listens, for the pages still there, and stops once the last one left', BOUNDED, async (t) => {
  const { cwd, journal } = await started(t, 'checkout')
  const reads = { count: 0 }
  const { open } = pipelineCanvas(t, { directory: () => { reads.count += 1; return cwd }, home: `${cwd}-home` })
  const { url } = await open()
  const token = await tokenOf(url)
  const first = contentStream(t, url, token)
  await first.next()
  const second = contentStream(t, url, token)
  await second.next()

  await first.close()
  await journal.append('question.asked', { key: 'adr-1', kind: 'adr-ratification', text: 'Ratify?', options: ['RATIFIED', 'REJECTED'], refusals: ['REJECTED'], header: 'ADR', step: 'adr', visit: 1, subjects: [] })
  assert.equal((await second.next((content) => content.question !== null)).question.key, 'adr-1')
  await second.close()

  const stopped = await settled(() => reads.count)
  assert.equal(await settled(() => reads.count, { quietTicks: 24 }), stopped)
})

test('a content that did not change is not sent again', BOUNDED, async (t) => {
  const { cwd } = await started(t, 'checkout')
  const { open } = pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` })
  const { url } = await open()
  const stream = contentStream(t, url, await tokenOf(url))

  await stream.next()
  await new Promise((done) => setTimeout(done, 150))

  assert.equal(stream.received.length, 1)
})
