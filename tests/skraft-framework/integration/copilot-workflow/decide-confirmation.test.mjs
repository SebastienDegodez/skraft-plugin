import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { PLUGIN_ROOT, confirmingSession, copilotHost, decideTool, journalEvents, workingCopy } from './simulated-host.mjs'
import { createSkraftDecideTool } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-decide-tool.mjs'
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

test('a decision the host was given no way to confirm is refused, never recorded as typed', async (t) => {
  const cwd = await waitingOnRatification(t)
  const tool = createSkraftDecideTool({ directory: () => cwd, pluginRoot: PLUGIN_ROOT, home: `${cwd}-home`, confirmation: /** @type {any} */ (undefined) })

  assert.equal(await tool.handler({ key: 'adr-1', answer: 'RATIFIED' }), 'Refused: this Copilot session cannot confirm a decision; nothing was recorded.')
  assert.deepEqual(await answers(cwd), [])
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

test('the person may answer questions one after another, and is asked at most five times in ten minutes', async (t) => {
  const cwd = await waitingOnRatification(t)
  const clock = { now: 0 }
  const session = confirmingSession({ answer: false })
  const tool = decideTool(cwd, session, { now: () => clock.now })
  const askedAt = async (seconds) => {
    clock.now = seconds * 1000
    return (await tool.handler({ key: 'adr-1', answer: 'RATIFIED' })).includes('too many decisions')
  }

  assert.deepEqual([await askedAt(0), await askedAt(1), await askedAt(2), await askedAt(3), await askedAt(599), await askedAt(599.5)], [false, false, false, false, false, true])
  assert.deepEqual([await askedAt(600), await askedAt(600.5), await askedAt(601)], [false, true, false])
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

/** What the plugin ships for an agent to read: both agent trees, the skills, the workflows and the templates. */
const PROMPT_ROOTS = Object.freeze(['com.github.copilot/agents', 'com.anthropic.claude-code/agents', 'skills', 'workflows', 'assets'])

/** Every file under one shipped root, named relative to the plugin; a generated folder left out. */
const shippedFiles = async (root) => {
  const entries = await readdir(join(PLUGIN_ROOT, root), { withFileTypes: true, recursive: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(PLUGIN_ROOT, join(entry.parentPath, entry.name)))
    .filter((path) => !path.split(sep).some((part) => ['node_modules', 'reports', '.stryker-tmp'].includes(part)))
}

test('no agent, skill, workflow or template of the plugin names skraft_decide', async () => {
  const files = (await Promise.all(PROMPT_ROOTS.map(shippedFiles))).flat()
  const naming = []
  for (const path of files) if ((await readFile(join(PLUGIN_ROOT, path), 'utf8')).includes('skraft_decide')) naming.push(path)

  assert.deepEqual(naming, [])
  for (const root of PROMPT_ROOTS) assert.ok(files.some((path) => path.startsWith(join(...root.split('/')) + sep)), `${root} was read`)
})
