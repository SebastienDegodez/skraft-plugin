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

test('an answer journaled without a person\'s provenance does not ratify: the run still waits on the question, and a person can still answer it', async () => {
  const host = scripted({}, proposed)
  await host.start()
  await createDecide({ ...host.deps, confirmation: confirmation('model', { ok: true }) }).decide({ key: 'adr-1', answer: 'RATIFIED' })

  const outcome = await host.run()

  assert.deepEqual([outcome.status, outcome.code], ['waiting', 'adr-ratification'])
  assert.deepEqual(host.git.engineCommits, [])
  assert.equal((await host.decide({ key: 'adr-1', answer: 'RATIFIED' })).ok, true)
  assert.equal((await host.run()).status, 'done')
})
