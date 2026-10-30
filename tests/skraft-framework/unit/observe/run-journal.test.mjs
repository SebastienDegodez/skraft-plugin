import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAdoptJournal } from '../../../../plugins/skraft-framework/engine/application/journal/adopt-usecase.mjs'
import { agent, pipelineHost, scripted, SLUG } from '../support/pipeline-host.mjs'
import { InMemoryJournalKeys } from '../support/in-memory-host.mjs'

const NO_ACTIVE = 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug'
const ADOPT = 'adopt the journal on this machine with skraft journal adopt, typed in your own terminal (its earlier lines stay unverified)'
const KEY_MISSING = (unverified) => `journal unverifiable: the key that signed events.jsonl is not in ~/.skraft/journal-keys on this machine (unverified: ${unverified}); restore it from the machine that started the run, or ${ADOPT}`
/** The lines from..to (1-based) as the engine names them unverified: their event types, counted in order of appearance. */
const linesOf = (events, from, to) => {
  const counts = new Map()
  for (const { type } of events.slice(from - 1, to)) counts.set(type, (counts.get(type) ?? 0) + 1)
  return `${from === to ? `line ${from}` : `lines ${from}-${to}`}: ${[...counts].map(([type, count]) => `${count} ${type}`).join(', ')}`
}
const blockedAgent = (it) => agent({ result: { status: 'blocked', summary: 'needs a decision' } })(it)
const unavailable = () => ({ ok: false, unavailable: true, text: '' })
/** A run started on another machine, stopped there, then opened here: this machine holds none of its keys. */
const movedHere = async () => {
  const host = scripted({ answers: [{ answer: 'STOP' }] }, (it) => [agent()(it), unavailable, blockedAgent(it)])
  await host.start()
  host.deps.journalKeys = new InMemoryJournalKeys()
  return host
}
/** What the person is shown, then the adoption of exactly that. */
const adopt = async (host) => {
  const adoption = createAdoptJournal(host.deps)
  return adoption.adopt(await adoption.preview())
}
const none = (slug, reason) => ({ slug, chain: { state: 'none', lines: 0, unverified: 0, reason }, entries: [], total: 0 })
const tampered = (reason) => ({ slug: SLUG, chain: { state: 'tampered', lines: 0, unverified: 0, reason }, entries: [], total: 0 })

test('the journal of a working copy with no active pipeline, or of a slug with no journal yet, has no entry and says why', async () => {
  const host = pipelineHost()

  assert.deepEqual(await host.journal(), none(null, NO_ACTIVE))

  await host.tracking.activate(SLUG)
  assert.deepEqual(await host.journal(), none(SLUG, `${SLUG} has no journal (events.jsonl)`))
})

test('the chain of a journal is verified over every line; one edited by hand is broken and shows no entry, even before the line that breaks; one signed on another machine is unverifiable until adopted, then names how many earlier lines stay unverified', async () => {
  const host = pipelineHost()
  await host.init()
  assert.deepEqual((await host.journal()).chain, { state: 'verified', lines: (await host.tracking.lines(SLUG)).length, unverified: 0, reason: '' })

  host.tracking.rewriteJournal(SLUG, (lines) => lines.map((line) => line.replace('"prev":null', '"prev":"0"')))
  assert.deepEqual(await host.journal(), tampered('journal tampered: events.jsonl line 1 does not open the chain; restore the file or start a new slug'))

  const cut = scripted({}, (it) => [agent()(it), unavailable])
  await cut.start()
  cut.tracking.rewriteJournal(SLUG, (lines) => lines.filter((_, index) => index !== 1))
  assert.deepEqual(await cut.journal(), tampered('journal tampered: events.jsonl line 2 does not chain to line 1; restore the file or start a new slug'))

  const moved = await movedHere()
  const before = (await moved.tracking.lines(SLUG)).length
  assert.deepEqual(await moved.journal(), { slug: SLUG, chain: { state: 'unverifiable', lines: 0, unverified: 0, reason: KEY_MISSING(linesOf(moved.events(), 1, before)) }, entries: [], total: 0 })
  await adopt(moved)
  assert.deepEqual((await moved.journal()).chain, { state: 'verified', lines: before + 1, unverified: before, reason: '' })
})
