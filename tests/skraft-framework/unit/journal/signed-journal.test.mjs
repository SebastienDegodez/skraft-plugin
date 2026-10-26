import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, pipelineHost, scripted, SLUG } from '../support/pipeline-host.mjs'
import { InMemoryJournalKeys } from '../support/in-memory-host.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const blocked = (reason, code = 'journal-tampered') => ({ status: 'blocked', slug: SLUG, phase: null, code, reason })
const tampered = (detail) => blocked(`journal tampered: events.jsonl ${detail}; restore the file or start a new slug`)
const UNVERIFIABLE = 'journal unverifiable: the key that signed events.jsonl is not in ~/.skraft/journal-keys on this machine (unverified: line 1: 1 run.started); restore it from the machine that started the run, or adopt the journal on this machine with skraft journal adopt, typed in your own terminal (its earlier lines stay unverified)'

/** A line chained to the journal's last one, the way anyone who can write the file can add it. */
const chainedLine = async (host, event) => {
  const lines = await host.tracking.lines(SLUG)
  return JSON.stringify({ type: event.type, at: '2026-10-11T09:30:00.000Z', prev: await host.deps.hasher.sha256(lines.at(-1)), ...event })
}

test('every line carries the signature of its text under the run\'s own key, which the first line names', async () => {
  const host = scripted({}, (it) => [agent()(it), unavailable])
  await host.start()
  const lines = await host.tracking.lines(SLUG)
  const [id] = host.deps.journalKeys.keys.keys()
  const key = await host.deps.journalKeys.read(id)

  const unsigned = lines.map((line) => line.replace(/,"sig":"[0-9a-f]+"}$/, '}'))

  assert.equal(host.deps.journalKeys.keys.size, 1)
  assert.equal(host.events()[0].keyId, id)
  assert.deepEqual(host.events().slice(1).map((event) => event.keyId), lines.slice(1).map(() => undefined))
  assert.deepEqual(host.events().map((event) => event.sig), await Promise.all(unsigned.map((line) => host.deps.hasher.hmacSha256(key, line))))
  assert.deepEqual(Object.keys(host.events()[1]).at(-1), 'sig')
})

test('an event chained to the journal but not signed by the run stops it before any agent, the journal left as it was', async () => {
  const cases = [
    [(line) => line, 'is not signed'],
    [(line) => `${line.slice(0, -1)},"sig":"${'0'.repeat(16)}"}`, 'does not carry the signature of the run\'s key'],
    [(line) => `${line.slice(0, -1)},"detail":{"x":1,"sig":"${'0'.repeat(16)}"},"more":1}`, 'is not signed'],
  ]
  for (const [sign, detail] of cases) {
    const host = scripted({}, (it) => [agent({ result: { status: 'blocked', summary: 'needs a decision' } })(it)])
    await host.start()
    const forged = await chainedLine(host, { type: 'phase.closed', phase: 'RESEARCH' })
    host.tracking.rewriteJournal(SLUG, (lines) => [...lines, sign(forged)])
    const before = await host.tracking.lines(SLUG)

    const outcome = await host.run()

    assert.deepEqual(outcome, tampered(`line ${before.length} ${detail}`))
    assert.equal(host.agentRunner.dispatches.length, 1)
    assert.deepEqual(await host.tracking.lines(SLUG), before)
  }
})

test('a line signed with a key of another run is refused as well', async () => {
  const keys = new InMemoryJournalKeys()
  const other = pipelineHost({ journalKeys: keys })
  await other.init()
  const host = pipelineHost({ journalKeys: keys })
  await host.init()
  const borrowed = (await other.tracking.lines(SLUG))[0].replace('"prev":null', `"prev":"${await host.deps.hasher.sha256((await host.tracking.lines(SLUG))[0])}"`)
  host.tracking.rewriteJournal(SLUG, (lines) => [...lines, borrowed])

  assert.deepEqual(await host.run(), tampered('line 2 does not carry the signature of the run\'s key'))
})

test('a journal whose key this machine does not hold is neither run, resumed nor shown', async () => {
  const host = pipelineHost()
  await host.init()
  host.deps.journalKeys = new InMemoryJournalKeys()

  assert.deepEqual(await host.run(), blocked(UNVERIFIABLE, 'journal-unverifiable'))
  assert.deepEqual(await host.init(), { ok: false, slug: SLUG, created: false, code: 'journal-unverifiable', reason: UNVERIFIABLE })
  const view = await host.view()
  assert.deepEqual([view.status, view.reason], ['tampered', UNVERIFIABLE])
  assert.equal(host.agentRunner.dispatches.length, 0)
})

test('a host that names no home folder says so, instead of a key missing from this machine', async () => {
  const host = pipelineHost()
  await host.init()
  host.deps.journalKeys.available = async () => false

  const reason = 'journal unverifiable: the environment names no home folder (HOME or USERPROFILE), where the key that signs events.jsonl is kept; set it and run again'
  assert.deepEqual(await host.run(), blocked(reason, 'journal-unverifiable'))
  assert.equal((await host.view()).reason, reason)
})

test('a first line that names no key of this engine\'s form is tampered, whatever file it points at', async () => {
  for (const id of [undefined, '../../config', 'ABCDEF'.repeat(5) + 'AB', 'a'.repeat(33), 7, ['0'.repeat(31) + '1']]) {
    const host = pipelineHost()
    await host.init()
    host.tracking.rewriteJournal(SLUG, ([first]) => [first.replace(/,"keyId":"[0-9a-f]{32}"/, id === undefined ? '' : `,"keyId":${JSON.stringify(id)}`)])

    assert.deepEqual(await host.run(), tampered('line 1 names no signing key'))
  }
})
