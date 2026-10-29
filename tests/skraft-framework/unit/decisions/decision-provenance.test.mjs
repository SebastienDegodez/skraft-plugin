import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDecide } from '../../../../plugins/skraft-framework/engine/application/decisions/decide-usecase.mjs'
import { agent, scripted, SLUG } from '../support/pipeline-host.mjs'
import { ADR_1, adrText, afterDesign, architect, eventsOf } from '../support/decisions.mjs'

const proposed = (it) => [agent()(it), architect({ [ADR_1]: adrText() })(it), ...afterDesign(it)]

/** A host confirmation that answers as told and keeps what it was asked. */
const confirmation = (by, answer) => {
  const asked = []
  return { asked, by, confirm: async (request) => { asked.push(request); return answer } }
}

test('a decision the host confirms is journaled with the host\'s provenance, and the next run ratifies on it', async () => {
  const host = scripted({}, proposed)
  await host.start()
  const confirming = confirmation('host-confirmed', { ok: true })

  const decided = await createDecide({ ...host.deps, confirmation: confirming }).decide({ key: 'adr-1', answer: 'ratified' })

  assert.deepEqual(decided, { ok: true, slug: SLUG, key: 'adr-1', code: null, reason: `${SLUG}: adr-1 answered RATIFIED; run the pipeline again to go on` })
  assert.deepEqual(confirming.asked, [{ slug: SLUG, key: 'adr-1', answer: 'RATIFIED' }])
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['adr-1', 'RATIFIED', 'host-confirmed']])
  assert.equal((await host.run()).status, 'done')
  assert.deepEqual(host.git.engineCommits.map((commit) => commit.message), ['docs(adr): ratify ADR-001'])
})

test('an answer a person confirmed at their own terminal is journaled cli-tty, one they pressed in the host\'s own pane host, and the next run acts on it', async () => {
  for (const by of ['cli-tty', 'host']) {
    const host = scripted({}, proposed)
    await host.start()
    const person = confirmation(by, { ok: true })

    const decided = await createDecide({ ...host.deps, confirmation: person }).decide({ key: 'adr-1', answer: 'RATIFIED' })

    assert.equal(decided.ok, true, decided.reason)
    assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer, by: provenance }) => [key, answer, provenance]), [['adr-1', 'RATIFIED', by]])
    assert.equal((await host.run()).status, 'done')
  }
})

test('an answer the host\'s own dialog gives during the run is journaled with the provenance that host declares, and the run acts on it', async () => {
  const host = scripted({ answers: [{ answer: 'ratified' }] }, proposed)
  host.human.by = 'host-confirmed'

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['adr-1', 'RATIFIED', 'host-confirmed']])
  assert.deepEqual(host.git.engineCommits.map((commit) => commit.message), ['docs(adr): ratify ADR-001'])
})

test('a decision the host does not confirm is refused with the host\'s reason, and nothing is journaled', async () => {
  const host = scripted({}, proposed)
  await host.start()
  const journaled = host.events().length
  const declining = confirmation('host-confirmed', { ok: false, code: 'not-confirmed', reason: 'you did not confirm it' })

  const decided = await createDecide({ ...host.deps, confirmation: declining }).decide({ key: 'adr-1', answer: 'RATIFIED' })

  assert.deepEqual(decided, { ok: false, slug: SLUG, key: 'adr-1', code: 'not-confirmed', reason: 'you did not confirm it' })
  assert.equal(host.events().length, journaled)
})

test('an answer the host is not asked to confirm, because it is not one the question takes, is refused first', async () => {
  const host = scripted({}, proposed)
  await host.start()
  const confirming = confirmation('host-confirmed', { ok: true })

  const decided = await createDecide({ ...host.deps, confirmation: confirming }).decide({ key: 'adr-1', answer: 'yes' })

  assert.equal(decided.code, 'invalid-answer')
  assert.deepEqual(confirming.asked, [])
})

test('a confirmation whose provenance is not a person\'s is refused before anything is asked or journaled; the run still waits, and a person can still answer', async () => {
  const host = scripted({}, proposed)
  await host.start()
  const journaled = host.events().length
  const foreign = confirmation('model', { ok: true })

  const decided = await createDecide({ ...host.deps, confirmation: foreign }).decide({ key: 'adr-1', answer: 'RATIFIED' })

  assert.deepEqual(decided, { ok: false, slug: SLUG, key: 'adr-1', code: 'unknown-provenance', reason: 'this host records decisions under a provenance the engine does not take from a person; nothing was recorded' })
  assert.deepEqual([foreign.asked, host.events().length], [[], journaled])
  const outcome = await host.run()
  assert.deepEqual([outcome.status, outcome.code], ['waiting', 'adr-ratification'])
  assert.deepEqual(host.git.engineCommits, [])
  assert.equal((await host.decide({ key: 'adr-1', answer: 'RATIFIED' })).ok, true)
  assert.equal((await host.run()).status, 'done')
})
