import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, CONSENTS, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const recorded = (host) => host.events().filter((event) => event.type === 'step.recorded' && !CONSENTS.includes(event.step))

test('two identical invalid results stop the run without a third attempt, null and a number alike', async () => {
  const host = scripted({}, (it) => [agent({ result: '{ "status": "finished" }' })(it), agent({ result: '{ "status": "finished" }' })(it)])

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'invalid-result',
    reason: `solution-researcher failed the same way on attempts 1 and 2: result status must be "done" or "blocked"; summary must be a non-empty string`,
  })
  assert.equal(host.agentRunner.dispatches.length, 2)
  assert.ok(host.agentRunner.dispatches[1].prompt.endsWith([
    '',
    'Refused in attempt 1 of 3:',
    `- result status must be "done" or "blocked"; summary must be a non-empty string`,
  ].join('\n')))
  assert.deepEqual(recorded(host).map(({ outcome: result, code, failures }) => [result, code, failures]), [
    ['failed', 'invalid-result', [`result status must be "done" or "blocked"; summary must be a non-empty string`]],
    ['failed', 'invalid-result', [`result status must be "done" or "blocked"; summary must be a non-empty string`]],
  ])
  assert.deepEqual(host.events().at(-1), { ...host.events().at(-1), type: 'run.finished', status: 'blocked', code: 'invalid-result', reason: outcome.reason })

  const scalars = scripted({}, (it) => [agent({ result: 'null' })(it), agent({ result: '42' })(it)])
  assert.equal((await scalars.start()).reason, `solution-researcher failed the same way on attempts 1 and 2: result must hold a JSON object`)
})

test('different invalid results get every attempt, then the run stops at the ceiling', async () => {
  const host = scripted({}, (it) => [agent({ result: null })(it), agent({ result: 'not json' })(it), agent({ result: '[]' })(it)])

  const outcome = await host.start()

  assert.equal(host.agentRunner.dispatches.length, 3)
  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'invalid-result',
    reason: `solution-researcher still failed after 3 attempts: result must hold a JSON object`,
  })
  assert.deepEqual(recorded(host).map((event) => event.failures), [
    [`result is missing`], [`result is not JSON`], [`result must hold a JSON object`],
  ])
})

test('a result with an unknown key or a blank summary is invalid; a valid one on the next attempt goes on', async () => {
  const host = scripted({}, (it) => [
    agent({ result: { status: 'done', summary: ' ', verdict: 'ok' } })(it),
    agent({ result: { status: 'done', summary: 'Researched the card payment.' } })(it),
    unavailable,
  ])

  await host.start()

  assert.deepEqual(recorded(host).map((event) => [event.outcome, event.failures]), [
    ['failed', [`result summary must be a non-empty string; unknown key verdict`]],
    ['done', []],
  ])
})

test('an agent that reports itself blocked stops the run at once with its reason', async () => {
  const host = scripted({}, (it) => [agent({ result: { status: 'blocked', summary: 'The story names no payment provider.' } })(it)])

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'agent-blocked', reason: 'solution-researcher is blocked: The story names no payment provider.' })
  assert.deepEqual(recorded(host).map(({ outcome: result, code, missing, failures }) => [result, code, missing, failures]), [['failed', 'agent-blocked', [], ['The story names no payment provider.']]])
  assert.deepEqual(host.events().map((event) => event.type), ['run.started', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'run.finished'])
  assert.equal(host.agentRunner.dispatches.length, 1)
})

test('missing outputs and an invalid result are both told, missing outputs naming the refusal', async () => {
  const host = scripted({}, (it) => [agent({ fill: false, result: null })(it), agent({ fill: false, result: null })(it)])

  const outcome = await host.start()

  assert.equal(outcome.code, 'missing-outputs')
  assert.equal(outcome.reason, `solution-researcher failed the same way on attempts 1 and 2: missing outputs: ${TRACKING}/research/2026-10-11/${SLUG}-research.md; result is missing`)
  assert.ok(host.agentRunner.dispatches[1].prompt.endsWith([
    '', 'Missing outputs from attempt 1 of 3:', `- ${TRACKING}/research/2026-10-11/${SLUG}-research.md`,
    '', 'Refused in attempt 1 of 3:', `- result is missing`,
  ].join('\n')))
})

test('the documents of an attempt are its files of the tracking folder, the engine\'s own files only at the top of it', async () => {
  const host = scripted({}, (it) => [async (dispatch) => {
    for (const path of ['events.jsonl.md', 'details/results/notes.md', 'details/reviews/old.md', '.lock-notes.md']) await it.tracking.write(SLUG, path, 'notes\n')
    return agent({ result: { status: 'blocked', summary: 'needs a decision' } })(it)(dispatch)
  }])

  await host.start()

  const { documents } = recorded(host).find((event) => event.step === 'research')
  assert.deepEqual(documents.filter((path) => !path.startsWith('research/')), ['.lock-notes.md', 'details/results/notes.md', 'details/reviews/old.md', 'events.jsonl.md'])
})
