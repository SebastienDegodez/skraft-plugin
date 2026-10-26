import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAdoptJournal } from '../../../../plugins/skraft-framework/engine/application/journal/adopt-usecase.mjs'
import { agent, pipelineHost, scripted, SLUG } from '../support/pipeline-host.mjs'
import { InMemoryJournalKeys } from '../support/in-memory-host.mjs'

const ADOPT = 'adopt the journal on this machine with skraft journal adopt, typed in your own terminal (its earlier lines stay unverified)'
const KEY_MISSING = `journal unverifiable: the key that signed events.jsonl is not in ~/.skraft/journal-keys on this machine; restore it from the machine that started the run, or ${ADOPT}`
const UNSIGNED = `journal unverifiable: events.jsonl is not signed (it was written before journals were); ${ADOPT}`
const blocked = (reason, code = 'journal-unverifiable') => ({ status: 'blocked', slug: SLUG, phase: null, code, reason })
const blockedAgent = (it) => agent({ result: { status: 'blocked', summary: 'needs a decision' } })(it)

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
/**
 * A run started on another machine, stopped there with its architect unavailable, then opened
 * here: this machine holds none of its keys. Resumed, its architect stops on a question.
 */
const movedHere = async () => {
  const host = scripted({}, (it) => [agent()(it), unavailable, blockedAgent(it)])
  await host.start()
  host.deps.journalKeys = new InMemoryJournalKeys()
  return host
}
const adopt = (host) => createAdoptJournal(host.deps).adopt()

test('a journal whose key is on another machine is adopted with a new key here: the run goes on, its earlier lines unverified', async () => {
  const host = await movedHere()
  const before = await host.tracking.lines(SLUG)
  assert.deepEqual(await host.run(), blocked(KEY_MISSING))

  const adopted = await adopt(host)

  assert.deepEqual(adopted, { ok: true, slug: SLUG, code: 'adopted', reason: `${SLUG}: journal adopted with a new key of this machine; its ${before.length} earlier lines stay unverified` })
  const line = host.events().at(-1)
  const [id] = host.deps.journalKeys.keys.keys()
  assert.deepEqual([line.type, line.keyId, line.previousKeyId, line.unverified], ['journal.adopted', id, host.events()[0].keyId, before.length])
  assert.deepEqual((await host.tracking.lines(SLUG)).slice(0, -1), before)
  assert.equal((await host.run()).code, 'agent-blocked')
  assert.equal(host.agentRunner.dispatches.length, 3)
  const after = host.events().slice(before.length + 1)
  const key = await host.deps.journalKeys.read(id)
  const lines = (await host.tracking.lines(SLUG)).slice(before.length)
  assert.ok(after.length > 0)
  assert.deepEqual(lines.map((text) => JSON.parse(text).sig), await Promise.all(lines.map((text) => host.deps.hasher.hmacSha256(key, text.replace(/,"sig":"[0-9a-f]+"}$/, '}')))))
})

test('a journal written before journals were signed is unverifiable, not tampered, and adopted the same way', async () => {
  const host = await movedHere()
  host.tracking.rewriteJournal(SLUG, () => [])
  const legacy = [JSON.stringify({ type: 'run.started', at: '2026-10-01T09:00:00.000Z', prev: null, slug: SLUG, story: null, workflow: 'skraft', base: [], artifacts: [], start: null, unlocked: [] })]
  host.tracking.rewriteJournal(SLUG, () => legacy)

  assert.deepEqual(await host.run(), blocked(UNSIGNED))
  const adopted = await adopt(host)

  assert.equal(adopted.reason, `${SLUG}: journal adopted with a new key of this machine; its 1 earlier lines stay unverified`)
  assert.equal(host.events().at(-1).previousKeyId, null)
  assert.equal((await host.run()).status, 'blocked')
})

test('an unsigned first line followed by signed ones is tampered, not a journal written before signing', async () => {
  const host = scripted({}, (it) => [blockedAgent(it)])
  await host.start()
  const lines = await host.tracking.lines(SLUG)
  const first = lines[0].replace(/,"keyId":"[0-9a-f]{32}"/, '').replace(/,"sig":"[0-9a-f]+"}$/, '}')
  const rechained = [first]
  for (const line of lines.slice(1)) rechained.push(line.replace(/"prev":"[0-9a-f]+"/, `"prev":"${await host.deps.hasher.sha256(rechained.at(-1))}"`))
  host.tracking.rewriteJournal(SLUG, () => rechained)

  assert.deepEqual(await host.run(), blocked('journal tampered: events.jsonl line 1 names no signing key; restore the file or start a new slug', 'journal-tampered'))
})

test('adoption is refused on a host with no home folder, and for an active pipeline with no journal yet', async () => {
  const homeless = await movedHere()
  homeless.deps.journalKeys.available = async () => false
  const lines = await homeless.tracking.lines(SLUG)
  assert.deepEqual(await adopt(homeless), {
    ok: false, slug: SLUG, code: 'journal-unverifiable',
    reason: 'journal unverifiable: the environment names no home folder (HOME or USERPROFILE), where the key that signs events.jsonl is kept; set it and run again',
  })
  assert.deepEqual(await homeless.tracking.lines(SLUG), lines)

  const empty = pipelineHost()
  await empty.tracking.activate(SLUG)
  assert.deepEqual(await adopt(empty), { ok: false, slug: SLUG, code: 'not-initialised', reason: `${SLUG} has no journal (events.jsonl); start it with an explicit init` })
})

test('adoption is refused for a journal this machine verifies, one whose chain is broken, and one with no run', async () => {
  const verified = scripted({}, (it) => [blockedAgent(it)])
  await verified.start()
  const lines = await verified.tracking.lines(SLUG)
  assert.deepEqual(await adopt(verified), { ok: false, slug: SLUG, code: 'journal-verified', reason: `${SLUG}: this machine verifies every line of the journal; there is nothing to adopt` })
  assert.deepEqual(await verified.tracking.lines(SLUG), lines)

  const broken = await movedHere()
  broken.tracking.rewriteJournal(SLUG, (all) => all.filter((_, index) => index !== 1))
  assert.deepEqual(await adopt(broken), { ok: false, slug: SLUG, code: 'journal-tampered', reason: 'journal tampered: events.jsonl line 2 does not chain to line 1; restore the file or start a new slug' })

  const none = pipelineHost()
  assert.deepEqual(await adopt(none), { ok: false, slug: null, code: 'no-active-pipeline', reason: 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug' })
})

test('after an adoption, a line the new key did not sign is tampered, and an earlier line edited breaks the chain', async () => {
  const host = await movedHere()
  await adopt(host)
  const adoptedAt = (await host.tracking.lines(SLUG)).length
  const forged = JSON.stringify({ type: 'phase.closed', at: '2026-10-11T09:30:00.000Z', prev: await host.deps.hasher.sha256((await host.tracking.lines(SLUG)).at(-1)), phase: 'RESEARCH' })
  host.tracking.rewriteJournal(SLUG, (all) => [...all, forged])

  assert.deepEqual(await host.run(), blocked(`journal tampered: events.jsonl line ${adoptedAt + 1} is not signed; restore the file or start a new slug`, 'journal-tampered'))
  host.tracking.rewriteJournal(SLUG, (all) => [...all.slice(0, -1), `${forged.slice(0, -1)},"sig":"${'0'.repeat(16)}"}`])
  assert.deepEqual(await host.run(), blocked(`journal tampered: events.jsonl line ${adoptedAt + 1} does not carry the signature of the run's key; restore the file or start a new slug`, 'journal-tampered'))
  host.tracking.rewriteJournal(SLUG, (all) => all.slice(0, -1).map((line, index) => (index === 1 ? line.replace('"visit":1', '"visit":2') : line)))
  assert.equal((await host.run()).code, 'journal-tampered')
})

test('an adoption line that names no key of this engine\'s form is tampered', async () => {
  const host = scripted({}, (it) => [blockedAgent(it)])
  await host.start()
  const lines = await host.tracking.lines(SLUG)
  const unnamed = JSON.stringify({ type: 'journal.adopted', at: '2026-10-11T09:30:00.000Z', prev: await host.deps.hasher.sha256(lines.at(-1)), previousKeyId: null, unverified: 0 })
  host.tracking.rewriteJournal(SLUG, (all) => [...all, unnamed])

  assert.deepEqual(await host.run(), blocked(`journal tampered: events.jsonl line ${lines.length + 1} names no signing key; restore the file or start a new slug`, 'journal-tampered'))
})

test('a fake adoption line, signed by no key of this machine, does not hide the earlier lines', async () => {
  const host = scripted({}, (it) => [blockedAgent(it)])
  await host.start()
  const last = (await host.tracking.lines(SLUG)).at(-1)
  const fake = JSON.stringify({ type: 'journal.adopted', at: '2026-10-11T09:30:00.000Z', prev: await host.deps.hasher.sha256(last), keyId: 'f'.repeat(32), previousKeyId: null, unverified: 3, sig: '0'.repeat(16) })
  host.tracking.rewriteJournal(SLUG, (all) => [...all, fake])

  assert.deepEqual(await host.run(), blocked(KEY_MISSING))
  assert.equal((await adopt(host)).reason, `${SLUG}: journal adopted with a new key of this machine; its 1 earlier lines stay unverified`)
  assert.equal((await host.run()).status, 'blocked')
})

test('lines signed under a key this machine holds are verified even before an adoption it cannot verify', async () => {
  const host = scripted({}, (it) => [blockedAgent(it)])
  await host.start()
  const { hasher } = host.deps
  const edited = (await host.tracking.lines(SLUG)).map((line, index) => (index === 2 ? line.replace('"visit":1', '"visit":2') : line))
  const rechained = []
  for (const line of edited) rechained.push(rechained.length === 0 ? line : line.replace(/"prev":"[0-9a-f]+"/, `"prev":"${await hasher.sha256(rechained.at(-1))}"`))
  const fake = JSON.stringify({ type: 'journal.adopted', at: '2026-10-11T09:30:00.000Z', prev: await hasher.sha256(rechained.at(-1)), keyId: 'f'.repeat(32), previousKeyId: null, unverified: 0, sig: '0'.repeat(16) })
  host.tracking.rewriteJournal(SLUG, () => [...rechained, fake])

  assert.deepEqual(await host.run(), blocked('journal tampered: events.jsonl line 3 does not carry the signature of the run\'s key; restore the file or start a new slug', 'journal-tampered'))
  assert.equal((await adopt(host)).code, 'journal-tampered')
})
