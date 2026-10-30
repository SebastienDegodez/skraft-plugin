import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { startPanel } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/canvas-server.mjs'
import { BOUNDED, contentStream, tokenOf } from './canvas-host.mjs'

/**
 * A panel whose first read of the content waits for `release()`, so that a test acts while the
 * first publish is under way. `reads()` counts the reads, the first included.
 * @param {import('node:test').TestContext} t
 */
const gatedPanel = async (t) => {
  let reads = 0
  let release = () => {}
  const gate = new Promise((done) => { release = () => done(undefined) })
  const running = await startPanel({ content: async () => { reads += 1; if (reads === 1) await gate; return { reads } }, pollMs: 20, save: async () => ({ ok: true, reason: '' }) })
  t.after(() => running.close())
  return { running, release, reads: () => reads }
}

/** @param {import('node:test').TestContext} t @param {() => boolean} done */
const until = async (t, done) => {
  const deadline = Date.now() + 10_000
  while (!done()) {
    assert.ok(Date.now() < deadline && !t.signal.aborted, 'the condition never came')
    await delay(10, undefined, { signal: t.signal })
  }
}

/** The reads that follow once the gate opens: none when nothing reads the content again. */
const readsAfter = async (t, { release, reads }) => {
  release()
  await delay(80, undefined, { signal: t.signal })
  const before = reads()
  await delay(400, undefined, { signal: t.signal })
  return reads() - before
}

test('no timer starts for a page that left while the first content was being read', BOUNDED, async (t) => {
  const panel = await gatedPanel(t)
  const stream = contentStream(t, panel.running.url, await tokenOf(panel.running.url))
  await until(t, () => panel.reads() === 1)

  await stream.close()
  await until(t, () => panel.running.idle())

  assert.equal(await readsAfter(t, panel), 0)
})

test('no timer starts for a panel closed while the first content was being read', BOUNDED, async (t) => {
  const panel = await gatedPanel(t)
  contentStream(t, panel.running.url, await tokenOf(panel.running.url))
  await until(t, () => panel.reads() === 1)

  await panel.running.close()

  assert.equal(await readsAfter(t, panel), 0)
})
