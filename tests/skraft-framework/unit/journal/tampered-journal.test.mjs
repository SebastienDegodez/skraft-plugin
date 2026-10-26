import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, pipelineHost, scripted, SLUG } from '../support/pipeline-host.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const tamperedOutcome = (line, detail) => ({
  status: 'blocked',
  slug: SLUG,
  phase: null,
  code: 'journal-tampered',
  reason: `journal tampered: events.jsonl line ${line} ${detail}; restore the file or start a new slug`,
})

test('every event carries the hash of the line before it, the first one null', async () => {
  const host = scripted({}, (it) => [agent()(it), unavailable])
  await host.start()
  const lines = await host.tracking.lines(SLUG)

  const prevs = host.events().map((event) => event.prev)

  assert.equal(prevs[0], null)
  assert.deepEqual(prevs.slice(1), await Promise.all(lines.slice(0, -1).map((line) => host.deps.hasher.sha256(line))))
  assert.deepEqual(Object.keys(host.events()[0]).slice(0, 3), ['type', 'at', 'prev'])
  assert.equal(host.events()[0].at, '2026-10-11T09:00:00.000Z')
})

test('an event edited by hand stops the run as tampered, dispatches nothing and writes nothing', async () => {
  const host = scripted({}, (it) => [agent({ fill: false })(it), agent({ fill: false })(it)])
  await host.start()
  host.tracking.rewriteJournal(SLUG, (lines) => lines.map((line) => line.replace('"outcome":"failed"', '"outcome":"done"')))
  const before = await host.tracking.lines(SLUG)

  const outcome = await host.run()

  assert.deepEqual(outcome, tamperedOutcome(8, 'does not chain to line 7'))
  assert.equal(host.agentRunner.dispatches.length, 2)
  assert.deepEqual(await host.tracking.lines(SLUG), before)
})

test('a removed event or an unreadable line breaks the chain too', async () => {
  const removed = scripted({}, (it) => [agent()(it), unavailable])
  await removed.start()
  removed.tracking.rewriteJournal(SLUG, (lines) => lines.filter((_, index) => index !== 1))
  assert.deepEqual(await removed.run(), tamperedOutcome(2, 'does not chain to line 1'))

  const garbled = pipelineHost()
  await garbled.init()
  garbled.tracking.rewriteJournal(SLUG, (lines) => [...lines, '{"type": "phase.closed"'])
  assert.deepEqual(await garbled.run(), tamperedOutcome(2, 'is not JSON'))

  const reordered = pipelineHost()
  await reordered.init()
  reordered.tracking.rewriteJournal(SLUG, (lines) => [lines[0].replace('"prev":null', '"prev":"0"')])
  assert.deepEqual(await reordered.run(), tamperedOutcome(1, 'does not open the chain'))
})

test('init on a tampered journal is refused and leaves the active pipeline as it was', async () => {
  const host = pipelineHost()
  await host.init()
  await host.tracking.activate('other')
  host.tracking.rewriteJournal(SLUG, (lines) => [lines[0].replace('"prev":null', '"prev":"0"')])

  const outcome = await host.init()

  assert.deepEqual(outcome, { ok: false, slug: SLUG, created: false, code: 'journal-tampered', reason: tamperedOutcome(1, 'does not open the chain').reason })
  assert.equal(host.tracking.activeSlug, 'other')
})

test('a line that is JSON but not an event object breaks the chain', async () => {
  for (const line of ['null', '[]', '42', '"text"']) {
    const host = pipelineHost()
    await host.init()
    host.tracking.rewriteJournal(SLUG, (lines) => [...lines, line])
    assert.deepEqual(await host.run(), tamperedOutcome(2, 'is not JSON'))
  }
})
