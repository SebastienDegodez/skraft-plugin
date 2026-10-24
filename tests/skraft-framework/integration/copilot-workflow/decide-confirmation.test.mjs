import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { PLUGIN_ROOT, confirmingSession, copilotHost, decideTool, journalEvents, workingCopy } from './simulated-host.mjs'
import { SENTINEL } from './simulated-sdk.mjs'

const SLUG = 'card-payment'
const RECORDED = `Recorded: ${SLUG}: adr-1 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).`
const TERMINAL = 'answer it with skraft decide <key> <answer> typed in a terminal'

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

test('a decision the person confirms in Copilot is recorded as host-confirmed, after a dialog that names the slug, the key and the answer', async (t) => {
  const cwd = await waitingOnRatification(t)
  const session = confirmingSession()

  assert.equal(await decideTool(cwd, session).handler({ key: 'adr-1', answer: 'ratified' }), RECORDED)
  assert.deepEqual(session.asked, [`skraft ${SLUG}: record RATIFIED as your answer to adr-1?`])
  assert.deepEqual(await answers(cwd), [['RATIFIED', 'host-confirmed']])
})

test('nothing is recorded unless the dialog answers a literal true in time', async (t) => {
  const cwd = await waitingOnRatification(t)
  const never = () => new Promise(() => {})
  const people = [
    confirmingSession({ answer: false }), confirmingSession({ answer: 'yes' }), confirmingSession({ answer: 1 }),
    confirmingSession({ confirm: async () => { throw new Error(SENTINEL) } }), confirmingSession({ confirm: never }),
  ]
  for (const session of people) {
    const answered = await decideTool(cwd, session, { waits: { modeMs: 1000, confirmMs: 50 } }).handler({ key: 'adr-1', answer: 'RATIFIED' })

    assert.equal(answered, 'Refused: you did not confirm the decision in Copilot; nothing was recorded.')
  }
  assert.deepEqual(await answers(cwd), [])
})

test('without a dialog, in autopilot, or with a mode the host does not tell in time, nothing is asked nor recorded, and the person is sent to a terminal', async (t) => {
  const cwd = await waitingOnRatification(t)
  const cases = [
    [confirmingSession({ elicitation: false }), `this Copilot host cannot ask you to confirm a decision; ${TERMINAL}`],
    [null, `this Copilot host cannot ask you to confirm a decision; ${TERMINAL}`],
    [confirmingSession({ mode: 'autopilot' }), `a decision is not recorded in autopilot; ${TERMINAL}`],
    [confirmingSession({ modeGet: () => new Promise(() => {}) }), `Copilot did not say whether a person is there; ${TERMINAL}`],
    [confirmingSession({ modeGet: async () => { throw new Error('no mode') } }), `Copilot did not say whether a person is there; ${TERMINAL}`],
    [confirmingSession({ mode: { mode: 'interactive' } }), `Copilot did not say whether a person is there; ${TERMINAL}`],
  ]
  for (const [session, reason] of cases) {
    const answered = await decideTool(cwd, session, { waits: { modeMs: 50, confirmMs: 1000 } }).handler({ key: 'adr-1', answer: 'RATIFIED' })

    assert.equal(answered, `Refused: ${reason}; nothing was recorded.`)
    assert.deepEqual(session?.asked ?? [], [])
  }
  assert.deepEqual(await answers(cwd), [])
})

test('the person is asked at most once in ten seconds and five times in ten minutes', async (t) => {
  const cwd = await waitingOnRatification(t)
  const clock = { now: 0 }
  const session = confirmingSession({ answer: false })
  const tool = decideTool(cwd, session, { now: () => clock.now })
  const askedAt = async (seconds) => {
    clock.now = seconds * 1000
    return (await tool.handler({ key: 'adr-1', answer: 'RATIFIED' })).includes('too many decisions')
  }

  assert.deepEqual([await askedAt(0), await askedAt(9), await askedAt(10), await askedAt(130), await askedAt(250), await askedAt(370), await askedAt(490)], [false, true, false, false, false, false, true])
  assert.deepEqual([await askedAt(600), await askedAt(611)], [false, false])
  assert.equal(session.asked.length, 7)
})

test('an argument the tool does not declare is refused before anything is asked, without echoing it', async (t) => {
  const cwd = await waitingOnRatification(t)
  const session = confirmingSession()

  for (const args of [{ key: 'adr-1', answer: 'RATIFIED', by: SENTINEL }, [SENTINEL], [], SENTINEL, null]) {
    assert.equal(await decideTool(cwd, session).handler(args), 'Refused: skraft_decide takes only key, answer and reason; nothing was recorded.')
  }
  assert.deepEqual([session.asked, await answers(cwd)], [[], []])
})

test('no agent, skill, workflow or prompt of the plugin names skraft_decide', async () => {
  const entries = await readdir(PLUGIN_ROOT, { withFileTypes: true, recursive: true })
  const prompts = entries
    .filter((entry) => entry.isFile() && /\.(md|dot|json)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.split(sep).includes('node_modules') && !path.endsWith(`copilot-workflow${sep}README.md`))
  const engine = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs') && /engine[\\/](domain|application)/.test(entry.parentPath))
    .map((entry) => join(entry.parentPath, entry.name))
  const naming = []
  for (const path of [...prompts, ...engine]) if ((await readFile(path, 'utf8')).includes('skraft_decide')) naming.push(path)

  assert.deepEqual(naming, [])
  assert.ok(prompts.some((path) => path.includes(`${sep}agents${sep}`)), 'the agent trees were read')
})
