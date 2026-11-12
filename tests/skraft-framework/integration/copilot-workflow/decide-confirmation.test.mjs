import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { answeringSession, copilotHost, decideTool, journalEvents, workingCopy } from './simulated-host.mjs'
import { SENTINEL } from './simulated-sdk.mjs'

const SLUG = 'card-payment'
const RECORDED = `Recorded: ${SLUG}: adr-1 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).`

/** A working copy whose active pipeline waits on the ratification adr-1. */
const waitingOnRatification = async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const adapters = createNodeAdapters(copilotHost(cwd))
  assert.equal((await createInit(adapters).init({ slug: SLUG })).ok, true)
  const opened = await openJournal(adapters, SLUG)
  await opened.journal.append('question.asked', {
    key: 'adr-1', kind: 'adr-ratification', text: 'Ratify the Proposed ADRs docs/adr/adr-001-x.md?',
    options: ['RATIFIED', 'REJECTED'], refusals: ['REJECTED'], header: 'ADR', step: 'adr', visit: 1, subjects: ['docs/adr/adr-001-x.md'],
  })
  return cwd
}

const answers = async (cwd) => (await journalEvents(cwd, SLUG)).filter((event) => event.type === 'question.answered').map(({ answer, by }) => [answer, by])

test('skraft_decide exposes the exact pending question without asking or recording, then records the native answer relayed by the model', async (t) => {
  const cwd = await waitingOnRatification(t)
  const session = answeringSession({ answers: ['RATIFIED'] })
  const tool = decideTool(cwd, session)

  const pending = await tool.handler({})
  assert.deepEqual(session.asked, [])
  assert.deepEqual(await answers(cwd), [])
  assert.deepEqual(JSON.parse(pending).question, {
    key: 'adr-1', kind: 'adr-ratification', text: 'Ratify the Proposed ADRs docs/adr/adr-001-x.md?',
    options: ['RATIFIED', 'REJECTED'], refusals: ['REJECTED'], header: 'ADR',
  })
  assert.equal(await tool.handler({ key: 'adr-1', answer: 'RATIFIED' }), RECORDED)
  assert.deepEqual(await answers(cwd), [['RATIFIED', 'decide']])
  assert.deepEqual(session.asked, [])
})

test('reads remain read-only even without a native dialog; a dismissed question leaves no answer to consume', async (t) => {
  const cwd = await waitingOnRatification(t)
  const session = answeringSession({ elicitation: false })
  const tool = decideTool(cwd, session)
  for (let tries = 0; tries < 12; tries += 1) assert.equal(JSON.parse(await tool.handler({})).question.key, 'adr-1')
  assert.deepEqual(session.asked, [])
  assert.deepEqual(await answers(cwd), [])
})

test('partial, unknown, null or invalid arguments are refused without echoing untrusted values or recording', async (t) => {
  const cwd = await waitingOnRatification(t)
  const session = answeringSession()
  const tool = decideTool(cwd, session)
  for (const args of [
    { key: 'adr-1' }, { answer: SENTINEL }, { by: SENTINEL }, [SENTINEL], [], SENTINEL, null, 0, true,
    { key: null, answer: 'RATIFIED' }, { key: '', answer: 'RATIFIED' },
    { key: 'adr-1', answer: 1 }, { key: 'adr-1', answer: ' ' }, { key: 'adr-1', answer: 'RATIFIED', reason: null },
    { key: 'adr-1', answer: 'RATIFIED', extra: SENTINEL },
  ]) assert.equal(await tool.handler(args), 'Refused: skraft_decide takes {} to read, or a non-empty key and answer with an optional non-empty reason to record; nothing was recorded.')
  assert.deepEqual(session.asked, [])
  assert.deepEqual(await answers(cwd), [])
})

test('stale keys, invalid options, missing refusal reason and duplicate answers remain refused', async (t) => {
  const cwd = await waitingOnRatification(t)
  const tool = decideTool(cwd)
  assert.match(await tool.handler({ key: 'old-1', answer: 'RATIFIED' }), /^Refused: no question has that key/)
  const invalid = await tool.handler({ key: 'adr-1', answer: SENTINEL })
  assert.match(invalid, /^Refused:/)
  assert.equal(invalid.includes(SENTINEL), false)
  assert.match(await tool.handler({ key: 'adr-1', answer: 'REJECTED' }), /^Refused:/)
  assert.deepEqual(await answers(cwd), [])
  assert.match(await tool.handler({ key: 'adr-1', answer: 'REJECTED', reason: '- Use the bank gateway' }), /^Recorded:/)
  assert.match(await tool.handler({ key: 'adr-1', answer: 'RATIFIED' }), /^Refused: adr-1 was already answered REJECTED/)
  assert.deepEqual(await answers(cwd), [['REJECTED', 'decide']])
})
