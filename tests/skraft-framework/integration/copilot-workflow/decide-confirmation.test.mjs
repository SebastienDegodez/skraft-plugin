import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { PLUGIN_ROOT, answeringSession, copilotHost, decideTool, journalEvents, workingCopy } from './simulated-host.mjs'
import { SENTINEL } from './simulated-sdk.mjs'

const SLUG = 'card-payment'
const RECORDED = `Recorded: ${SLUG}: adr-1 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).`
const TERMINAL = 'answer it with skraft decide adr-1 RATIFIED|REJECTED typed in a terminal'

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

test('skraft_decide puts the question the run waits on once, as a choice among its options, and records the option chosen as host-confirmed, with no confirmation after it', async (t) => {
  const cwd = await waitingOnRatification(t)
  const session = answeringSession({ answers: ['RATIFIED'] })

  assert.equal(await decideTool(cwd, session).handler({}), RECORDED)
  assert.deepEqual(session.asked, [{ kind: 'select', message: 'Ratify the Proposed ADRs docs/adr/adr-001-x.md?', options: ['RATIFIED', 'REJECTED'] }])
  assert.deepEqual(await answers(cwd), [['RATIFIED', 'host-confirmed']])
})

test('nothing is recorded unless the dialog gives one of the options in time; a dialog the host gives no answer to is told apart from a dismissal', async (t) => {
  const cwd = await waitingOnRatification(t)
  const never = () => new Promise(() => {})
  const dismissed = `Refused: you did not answer the question in Copilot; ${TERMINAL}; nothing was recorded.`
  const unasked = `Refused: Copilot did not put the question to you; ${TERMINAL}; nothing was recorded.`
  const people = [
    [null, dismissed], [never, dismissed],
    ['yes', unasked], [1, unasked], [true, unasked],
    [() => undefined, unasked], [async () => { throw new Error(SENTINEL) }, unasked],
  ]
  for (const [answer, reason] of people) {
    const answered = await decideTool(cwd, answeringSession({ answers: [answer] }), { waits: { modeMs: 1000, answerMs: 50 } }).handler({})

    assert.equal(answered, reason)
  }
  assert.deepEqual(await answers(cwd), [])
})

test('without a dialog, in autopilot, or with a mode the host does not tell in time, nothing is asked nor recorded, and the person is sent to a terminal', async (t) => {
  const cwd = await waitingOnRatification(t)
  const cases = [
    [answeringSession({ elicitation: false }), 'this Copilot host cannot put a question to you'],
    [null, 'this Copilot host cannot put a question to you'],
    [answeringSession({ mode: 'autopilot' }), 'Copilot does not put a question to you in autopilot'],
    [answeringSession({ modeGet: () => new Promise(() => {}) }), 'Copilot did not say whether a person is there'],
    [answeringSession({ modeGet: async () => { throw new Error('no mode') } }), 'Copilot did not say whether a person is there'],
    [answeringSession({ mode: { mode: 'interactive' } }), 'Copilot did not say whether a person is there'],
  ]
  for (const [session, reason] of cases) {
    const answered = await decideTool(cwd, session, { waits: { modeMs: 50, answerMs: 1000 } }).handler({})

    assert.equal(answered, `Refused: ${reason}; ${TERMINAL}; nothing was recorded.`)
    assert.deepEqual(session?.asked ?? [], [])
  }
  assert.deepEqual(await answers(cwd), [])
})

test('the person may be asked one question after another, and at most five times in ten minutes', async (t) => {
  const cwd = await waitingOnRatification(t)
  const clock = { now: 0 }
  const session = answeringSession()
  const tool = decideTool(cwd, session, { now: () => clock.now })
  const askedAt = async (seconds) => {
    clock.now = seconds * 1000
    return (await tool.handler({})).includes('too many questions')
  }

  assert.deepEqual([await askedAt(0), await askedAt(1), await askedAt(2), await askedAt(3), await askedAt(599), await askedAt(599.5)], [false, false, false, false, false, true])
  assert.deepEqual([await askedAt(600), await askedAt(600.5), await askedAt(601)], [false, true, false])
  assert.equal(session.asked.length, 7)
})

test('a dialog the host never shows takes no place in the limit: after six unasked tries, the option the person then chooses is still recorded', async (t) => {
  const cwd = await waitingOnRatification(t)
  const unshown = () => undefined
  const session = answeringSession({ answers: [unshown, unshown, unshown, unshown, unshown, unshown, 'RATIFIED'] })
  const tool = decideTool(cwd, session, { now: () => 0 })
  const unasked = `Refused: Copilot did not put the question to you; ${TERMINAL}; nothing was recorded.`

  for (let tries = 0; tries < 6; tries += 1) assert.equal(await tool.handler({}), unasked)

  assert.equal(await tool.handler({}), RECORDED)
  assert.deepEqual([session.asked.length, await answers(cwd)], [7, [['RATIFIED', 'host-confirmed']]])
})

test('any argument is refused before anything is asked, without echoing it: neither the question nor the answer comes from the model', async (t) => {
  const cwd = await waitingOnRatification(t)
  const session = answeringSession({ answers: ['RATIFIED'] })

  for (const args of [{ key: 'adr-1', answer: 'RATIFIED' }, { answer: SENTINEL }, { by: SENTINEL }, [SENTINEL], [], SENTINEL, null]) {
    assert.equal(await decideTool(cwd, session).handler(args), 'Refused: skraft_decide takes no argument: it asks the person the question itself; nothing was recorded.')
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
