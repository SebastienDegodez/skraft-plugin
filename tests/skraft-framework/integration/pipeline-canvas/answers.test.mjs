import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createHostConfirmation } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/host-confirmation.mjs'
import { actsAs, confirmingSession, copilotHost, simulatedContext } from '../copilot-workflow/simulated-host.mjs'
import { SENTINEL } from '../copilot-workflow/simulated-sdk.mjs'
import { SLUG, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { journal } from '../support/workspace.mjs'
import { contentStream, pipelineCanvas, request, tokenOf } from './canvas-host.mjs'

const RECORDED = `Recorded: ${SLUG}: adr-1 answered RATIFIED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).`
const TERMINAL = 'answer it with skraft decide <key> <answer> typed in a terminal'

/**
 * A run paused on its ADR ratification, and an open panel whose person answers the host's dialog
 * as `session` says. The panel reads its content again only once a minute: what the page gets
 * right after an answer is the answer's doing.
 */
const waitingPanel = async (t, session, waits) => {
  const { cwd } = pipelineRepository(t)
  const { ctx } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd)), { message: 'paused at adr-1' })
  const confirmation = createHostConfirmation({ session: () => session, ...(waits === undefined ? {} : { waits }) })
  const where = { cwd: /** @type {string | null} */ (cwd) }
  const { open } = pipelineCanvas(t, { directory: () => where.cwd, home: `${cwd}-home`, more: { confirmation, pollMs: 60_000 } })
  const { url } = await open()
  const token = await tokenOf(url)
  /** @param {unknown} body @param {Record<string, string>} [headers] */
  const answer = async (body, headers = {}) => {
    const sent = await request(new URL('/answer', url).href, { method: 'POST', headers: { 'x-skraft-token': token, origin: new URL(url).origin, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' || Array.isArray(body) ? body : JSON.stringify(body) })
    return [sent.status, JSON.parse(sent.text)]
  }
  return { cwd, url, token, answer, where }
}

const answered = (cwd) => journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, by, reason }) => [key, answer, by, reason ?? null])

test('an answer button records the answer once the person confirms it in Copilot, as host-confirmed, and the page at once shows the run no longer waiting', async (t) => {
  const session = confirmingSession()
  const { cwd, url, token, answer } = await waitingPanel(t, session)
  const stream = contentStream(t, url, token)
  assert.equal((await stream.next()).question.key, 'adr-1')

  assert.deepEqual(await answer({ key: 'adr-1', answer: 'RATIFIED' }), [200, { recorded: true, text: RECORDED }])

  assert.deepEqual(session.asked, [`skraft ${SLUG}: record RATIFIED as your answer to adr-1?`])
  assert.deepEqual(answered(cwd), [['adr-1', 'RATIFIED', 'host-confirmed', null]])
  assert.deepEqual((await stream.next()).question, null)
})

test('an answer that changed nothing sends the page nothing again', async (t) => {
  const { url, token, answer } = await waitingPanel(t, confirmingSession({ answer: false }))
  const stream = contentStream(t, url, token)
  await stream.next()

  assert.equal((await answer({ key: 'adr-1', answer: 'RATIFIED' }))[0], 200)
  await new Promise((done) => setTimeout(done, 100))

  assert.equal(stream.received.length, 1)
})

test('a refusal needs its reason, which is recorded with it', async (t) => {
  const { cwd, answer } = await waitingPanel(t, confirmingSession())

  assert.deepEqual(await answer({ key: 'adr-1', answer: 'REJECTED' }), [200, { recorded: false, text: 'Refused: REJECTED needs the reason, which goes back to the agent; nothing was recorded.' }])
  assert.deepEqual(await answer({ key: 'adr-1', answer: 'REJECTED', reason: 'use the bank gateway' }), [200, { recorded: true, text: `Recorded: ${SLUG}: adr-1 answered REJECTED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).` }])
  assert.deepEqual(answered(cwd), [['adr-1', 'REJECTED', 'host-confirmed', 'use the bank gateway']])
})

test('nothing is recorded when the person declines, in autopilot, without a dialog, or when the mode cannot be read; no dialog text, exception or path reaches the page', async (t) => {
  const cases = [
    [confirmingSession({ answer: false }), 'you did not confirm the decision in Copilot'],
    [confirmingSession({ confirm: async () => { throw new Error(SENTINEL) } }), 'you did not confirm the decision in Copilot'],
    [confirmingSession({ mode: 'autopilot' }), `a decision is not recorded in autopilot; ${TERMINAL}`],
    [confirmingSession({ elicitation: false }), `this Copilot host cannot ask you to confirm a decision; ${TERMINAL}`],
    [confirmingSession({ modeGet: async () => { throw new Error(SENTINEL) } }), `Copilot did not say whether a person is there; ${TERMINAL}`],
  ]
  for (const [session, reason] of cases) {
    const { cwd, answer } = await waitingPanel(t, session, { modeMs: 50, confirmMs: 1000 })

    assert.deepEqual(await answer({ key: 'adr-1', answer: 'RATIFIED' }), [200, { recorded: false, text: `Refused: ${reason}; nothing was recorded.` }])
    assert.deepEqual(answered(cwd), [])
  }
})

test('an answer needs the panel\'s token and the page\'s own origin, and a JSON object of at most 16 KiB with only key, answer and reason', async (t) => {
  const session = confirmingSession()
  const { cwd, answer } = await waitingPanel(t, session)
  const forbidden = [403, { error: 'this request does not come from the panel' }]
  const badBody = [400, { error: 'an answer is a JSON object of at most 16 KiB' }]
  const ratify = { key: 'adr-1', answer: 'RATIFIED' }

  assert.deepEqual(await answer(ratify, { 'x-skraft-token': '' }), forbidden)
  assert.deepEqual(await answer(ratify, { 'x-skraft-token': 'f'.repeat(48) }), forbidden)
  assert.deepEqual(await answer(ratify, { origin: 'http://evil.example' }), forbidden)
  assert.deepEqual(await answer(ratify, { origin: '' }), forbidden)
  const padded = (size) => JSON.stringify({ ...ratify, by: 'decide' }).padEnd(size, ' ')
  for (const body of ['not json', '[]', 'null', '"RATIFIED"', '3', JSON.stringify({ ...ratify, reason: 'x'.repeat(16 * 1024) }), padded(16 * 1024 + 1)]) assert.deepEqual(await answer(body), badBody)
  const unknownKey = [200, { recorded: false, text: 'Refused: skraft_decide takes only key, answer and reason; nothing was recorded.' }]
  assert.deepEqual(await answer({ ...ratify, by: 'decide' }), unknownKey)
  assert.deepEqual(await answer(padded(16 * 1024)), unknownKey)
  assert.deepEqual(await answer([JSON.stringify(ratify), ' '.repeat(16 * 1024)]), badBody)
  assert.deepEqual([session.asked, answered(cwd)], [[], []])
})

test('an answer for a session with no directory is refused, and one skraft cannot read the pipeline for gets a fixed failure', async (t) => {
  const { cwd, answer, where } = await waitingPanel(t, confirmingSession())

  where.cwd = null
  assert.deepEqual(await answer({ key: 'adr-1', answer: 'RATIFIED' }), [200, { recorded: false, text: 'Refused: the session has no working directory yet; nothing was recorded.' }])
  where.cwd = cwd
  const active = join(cwd, '.copilot-tracking', 'skraft-plans', '.active-slug')
  rmSync(active)
  mkdirSync(active)
  assert.deepEqual(await answer({ key: 'adr-1', answer: 'RATIFIED' }), [500, { error: 'skraft could not answer; run skraft status in a terminal' }])
})
