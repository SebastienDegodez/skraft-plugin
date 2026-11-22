import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

/** An agent that stops by itself without finishing: an incident no rule of the engine classifies. */
const stopsUnfinished = () => ({ ok: false, text: '' })
/** A run whose researcher stops unfinished `times` times, then the story goes on as the nominal one. */
const incidentHost = (times = 1) => scripted({}, (host) => [...Array(times).fill(stopsUnfinished), ...nominal(host)])
const asked = (host) => host.events().filter(({ type }) => type === 'question.asked').at(-1)
const judgment = (answer, extra = {}) => ({ answer, by: 'host-llm', model: 'observed-test-model', cost: 0.02, costUnit: 'USD', ...extra })
const unforeseenKey = (host) => host.events().find(({ type, kind }) => type === 'question.asked' && kind === 'unforeseen').key
const INCIDENT_LOG = /\/logs\/incident-research-\w{7}\.log$/

test('an unclassified incident asks the host LLM once with a closed recovery menu and its evidence', async () => {
  const host = incidentHost()

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.code], ['waiting', 'unforeseen'])
  const question = asked(host)
  assert.equal(question.incident.owner, 'unknown')
  assert.match(question.incident.log, INCIDENT_LOG)
  assert.deepEqual(question.options, ['RETRY', 'RETRY_WITH_NOTE', 'STOP'])
  assert.equal(question.incidents[0].attempts, 1)
  assert.match(question.text, /Read \S+incident-research-\w{7}\.log.*model.*cost/s)
  assert.deepEqual((await host.view()).question.options, question.options)
  assert.equal(host.events().some(({ type }) => type === 'question.answered'), false, 'nothing is answered for the host LLM')
  assert.equal(host.agentRunner.dispatches.length, 1)
  assert.equal(host.slug, SLUG)
})

test('a host LLM retry records its model and observed cost then resumes the same attempt', async () => {
  const host = incidentHost()
  await host.start()

  const decided = await host.decide(judgment('RETRY'))

  assert.equal(decided.ok, true, decided.reason)
  const answer = host.events().filter(({ type }) => type === 'question.answered').at(-1)
  assert.deepEqual([answer.by, answer.model, answer.cost, answer.costUnit], ['host-llm', 'observed-test-model', 0.02, 'USD'])
  assert.equal((await host.run()).status, 'done')
  const report = await host.report()
  assert.deepEqual(report.answers.find(({ kind }) => kind === 'unforeseen'), {
    key: unforeseenKey(host), kind: 'unforeseen', step: 'research', answer: 'RETRY', reason: null,
    by: 'host-llm', model: 'observed-test-model', cost: 0.02, costUnit: 'USD',
  })
  const markdown = await host.tracking.read(SLUG, 'run-report.md')
  assert.match(markdown, /## Automated judgments[\s\S]*host-llm.*observed-test-model.*0\.02.*USD/)
  assert.equal(markdown.slice(markdown.indexOf('## Human answers'), markdown.indexOf('## Automated judgments')).includes('host-llm'), false)
  assert.deepEqual(host.agentRunner.dispatches.slice(0, 2).map(({ label }) => label), Array(2).fill(`skraft ${SLUG} · research · attempt 1`))
})

test('the same signature after a resume goes back to a person, never to a second LLM judgment', async () => {
  const host = incidentHost(2)
  await host.start()
  await host.decide(judgment('RETRY'))

  const outcome = await host.run()

  assert.deepEqual([outcome.status, outcome.code], ['waiting', 'environment'])
  assert.equal(asked(host).incidents[0].attempts, 2)
  assert.equal(host.events().filter(({ type, kind }) => type === 'question.asked' && kind === 'unforeseen').length, 1)
  assert.equal((await host.run()).code, 'environment')
  const refused = await host.decide(judgment('RETRY'))
  assert.equal(refused.code, 'human-required')
  assert.equal((await host.decide({ answer: 'RETRY' })).ok, true)
  assert.equal((await host.run()).status, 'done')
})

test('STOP ends the unforeseen run with a diagnostic and no later work', async () => {
  const host = incidentHost()
  await host.start()
  assert.equal((await host.decide(judgment('STOP'))).ok, true)

  const stopped = await host.run()

  assert.deepEqual([stopped.status, stopped.code], ['blocked', 'unforeseen-stopped'])
  assert.match(stopped.reason, /research.*STOP.*incident-research-\w{7}\.log/)
  assert.equal((await host.run()).code, 'unforeseen-stopped')
  assert.equal(host.agentRunner.dispatches.length, 1)
})

test('an invalid action or missing usage stops diagnostically instead of waiting or guessing', async () => {
  for (const decision of [
    judgment('RUN:untrusted'), judgment('SEND_TO:pr_writer'), judgment('RETRY', { by: undefined }),
    ...[-1, NaN, Infinity, '0.02'].map((cost) => judgment('RETRY', { cost })),
    ...[undefined, '', '@untrusted'].map((model) => judgment('RETRY', { model })),
    judgment('RETRY', { costUnit: undefined }),
    ...['', '<b></b>', 'x'.repeat(501)].map((reason) => judgment('RETRY_WITH_NOTE', { reason })),
  ]) {
    const host = incidentHost()
    await host.start()

    const refused = await host.decide(decision)
    const stopped = await host.run()

    assert.equal(refused.code, 'invalid-judgment')
    assert.deepEqual([stopped.status, stopped.code], ['blocked', 'invalid-judgment'])
    assert.match(stopped.reason, /unforeseen.*(menu|observed model|inert note)/)
    assert.equal(stopped.reason.includes('untrusted'), false)
    assert.equal((await host.view()).question, null)
    assert.equal(host.agentRunner.dispatches.length, 1)
  }
})

test('RETRY_WITH_NOTE keeps only a bounded inert note and retries the same attempt', async () => {
  for (const [reason, expected] of [['<b>Retry</b>\n@maintainer fixes #42', 'Retry `@maintainer` `fixes #42`'], ['x'.repeat(500), 'x'.repeat(500)]]) {
    const host = incidentHost()
    await host.start()

    const decided = await host.decide(judgment('RETRY_WITH_NOTE', { reason }))

    assert.equal(decided.ok, true, decided.reason)
    const answer = host.events().filter(({ type }) => type === 'question.answered').at(-1)
    assert.equal(answer.reason, expected)
    assert.equal((await host.run()).status, 'done')
    assert.deepEqual(host.agentRunner.dispatches.slice(0, 2).map(({ label }) => label), Array(2).fill(`skraft ${SLUG} · research · attempt 1`))
  }
})

test('a judgment returned during the run cannot bypass usage validation through the human interaction path', async () => {
  const host = incidentHost()
  await host.start()
  const ask = host.human.ask.bind(host.human)
  host.human.ask = async (question) => (question.kind === 'unforeseen' ? judgment('RETRY') : ask(question))

  assert.equal((await host.run()).status, 'done')

  const answer = host.events().find(({ type, key }) => type === 'question.answered' && key === unforeseenKey(host))
  assert.deepEqual([answer.by, answer.model, answer.cost], ['host-llm', 'observed-test-model', 0.02])
})

test('an agent that stops without finishing asks the host LLM once for a recovery, whose retry dispatches the same attempt again; a person who stopped it still stops the run', async () => {
  const host = scripted({}, (it) => [stopsUnfinished, agent()(it), () => ({ ok: false, unavailable: true, text: '' })])

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.code], ['waiting', 'unforeseen'])
  const question = asked(host)
  assert.deepEqual([question.step, question.incident.owner, question.incidents[0].category], ['research', 'unknown', 'agent-failed'])
  assert.match(question.text, /research stopped on an unforeseen incident\. Read \S+\/logs\/incident-research-\w{7}\.log/)
  assert.equal(await host.tracking.read(SLUG, question.incident.log.slice(question.incident.log.indexOf('logs/'))), 'solution-researcher stopped without finishing: no answer\n')
  assert.equal((await host.decide(judgment('RETRY'))).ok, true)
  await host.run()
  assert.deepEqual(host.agentRunner.dispatches.slice(0, 2).map(({ label }) => label), Array(2).fill(`skraft ${SLUG} · research · attempt 1`))
  assert.equal(host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'research').at(0).outcome, 'done')

  const stopped = scripted({}, () => [() => ({ ok: false, text: '', interrupted: true, error: 'aborted by the user' })])
  assert.deepEqual(await stopped.start(), { status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'agent-failed', reason: 'solution-researcher stopped without finishing: aborted by the user' })
})
