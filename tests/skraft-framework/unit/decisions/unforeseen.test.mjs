import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, green, scripted, SLUG, TRACKING, tddCycle } from '../support/pipeline-host.mjs'

const incidentHost = () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 137 } })
  return scripted({ machine }, (host) => [agent()(host), agent()(host), agent()(host), agent({ work: green() })(host)])
}
const asked = (host) => host.events().filter(({ type }) => type === 'question.asked').at(-1)
const judgment = (answer, extra = {}) => ({ answer, by: 'host-llm', model: 'observed-test-model', cost: 0.02, costUnit: 'USD', ...extra })

test('an unclassified incident asks the host LLM once with a closed recovery menu and its evidence', async () => {
  const host = incidentHost()

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.code], ['waiting', 'unforeseen'])
  const question = asked(host)
  assert.equal(question.incident.owner, 'unknown')
  assert.equal(question.incident.log, `${TRACKING}/gates/api/test-1.log`)
  assert.deepEqual(question.options, ['RETRY', 'RETRY_WITH_NOTE', 'SEND_TO:deliver', 'STOP'])
  assert.equal(question.incidents[0].attempts, 1)
  assert.match(question.text, /Read.*test-1\.log.*model.*cost/s)
  assert.deepEqual((await host.view()).question.options, question.options)
  assert.equal(host.events().some(({ type }) => type === 'question.answered'), true, 'the earlier scenario review remains a human decision')
  assert.equal(host.agentRunner.dispatches.length, 4)
  assert.equal(host.slug, SLUG)
})

test('a host LLM retry records its model and observed cost then resumes the same attempt', async () => {
  const host = incidentHost()
  await host.start()

  const decided = await host.decide(judgment('RETRY'))

  assert.equal(decided.ok, true, decided.reason)
  const answer = host.events().filter(({ type }) => type === 'question.answered').at(-1)
  assert.deepEqual([answer.by, answer.model, answer.cost, answer.costUnit], ['host-llm', 'observed-test-model', 0.02, 'USD'])
  host.machine.exits['. $ dotnet test'] = 0
  assert.equal((await host.run()).status, 'done')
  const report = await host.report()
  assert.deepEqual(report.answers.find(({ kind }) => kind === 'unforeseen'), {
    key: asked(host).key, kind: 'unforeseen', step: 'gates', answer: 'RETRY', reason: null,
    by: 'host-llm', model: 'observed-test-model', cost: 0.02, costUnit: 'USD',
  })
  const markdown = await host.tracking.read(SLUG, 'run-report.md')
  assert.match(markdown, /## Automated judgments[\s\S]*host-llm.*observed-test-model.*0\.02.*USD/)
  assert.equal(markdown.slice(markdown.indexOf('## Human answers'), markdown.indexOf('## Automated judgments')).includes('host-llm'), false)
  assert.deepEqual(host.events().filter(({ type, step }) => type === 'step.started' && step === 'gates').map(({ visit, attempt }) => [visit, attempt]), [[1, 1]])
  assert.equal(host.agentRunner.dispatches.length, 5)
})

test('the same signature after a resume goes back to a person, never to a second LLM judgment', async () => {
  const host = incidentHost()
  await host.start()
  await host.decide(judgment('RETRY'))

  const outcome = await host.run()

  assert.deepEqual([outcome.status, outcome.code], ['waiting', 'environment'])
  assert.equal(asked(host).incidents[0].attempts, 2)
  assert.equal(host.events().filter(({ type, kind }) => type === 'question.asked' && kind === 'unforeseen').length, 1)
  assert.equal((await host.run()).code, 'environment')
  const refused = await host.decide(judgment('RETRY'))
  assert.equal(refused.code, 'human-required')
  host.machine.exits['. $ dotnet test'] = 0
  assert.equal((await host.decide({ answer: 'RETRY' })).ok, true)
  assert.equal((await host.run()).status, 'done')
})

test('STOP ends the unforeseen run with a diagnostic and no later work', async () => {
  const host = incidentHost()
  await host.start()
  assert.equal((await host.decide(judgment('STOP'))).ok, true)

  const stopped = await host.run()

  assert.deepEqual([stopped.status, stopped.code], ['blocked', 'unforeseen-stopped'])
  assert.match(stopped.reason, /gates.*STOP.*test-1\.log/)
  assert.equal((await host.run()).code, 'unforeseen-stopped')
  assert.equal(host.agentRunner.dispatches.length, 4)
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
    assert.equal(host.agentRunner.dispatches.length, 4)
  }
})

test('a selected return cannot silently follow a changed graph edge', async () => {
  const host = incidentHost()
  await host.start()
  await host.decide(judgment('SEND_TO:deliver'))
  host.deps.workflowSource.text = host.deps.workflowSource.text
    .replace('  pr_writer [', '  recovery [shape=box, agent="software-engineer", phase="DELIVER"]\n  recovery -> gates\n  pr_writer [')
    .replace('gates -> deliver [label="FAIL", max_visits=3]', 'gates -> recovery [label="FAIL", max_visits=3]')
  host.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '' }))

  const stopped = await host.run()

  assert.deepEqual([stopped.status, stopped.code], ['blocked', 'workflow-changed'], stopped.reason)
  assert.equal(host.agentRunner.dispatches.length, 4)
})

test('RETRY_WITH_NOTE keeps only a bounded inert note and retries without another agent attempt', async () => {
  for (const [reason, expected] of [['<b>Retry</b>\n@maintainer fixes #42', 'Retry `@maintainer` `fixes #42`'], ['x'.repeat(500), 'x'.repeat(500)]]) {
    const host = incidentHost()
    await host.start()

    const decided = await host.decide(judgment('RETRY_WITH_NOTE', { reason }))

    assert.equal(decided.ok, true, decided.reason)
    const answer = host.events().filter(({ type }) => type === 'question.answered').at(-1)
    assert.equal(answer.reason, expected)
    host.machine.exits['. $ dotnet test'] = 0
    assert.equal((await host.run()).status, 'done')
    assert.equal(host.events().filter(({ type, step }) => type === 'step.started' && step === 'gates').length, 1)
  }
})

test('SEND_TO returns work only through the offered graph edge and still runs its locked gates', async () => {
  const host = incidentHost()
  await host.start()
  host.agentRunner.behaviours.push(agent({ work: (it) => {
    it.machine.exits['. $ dotnet test'] = 0
    tddCycle(SLUG, 'Recovery')(it)
  } })(host))
  assert.equal((await host.decide(judgment('SEND_TO:deliver'))).ok, true)

  const outcome = await host.run()

  assert.equal(outcome.status, 'done', outcome.reason)
  const deliveries = host.agentRunner.dispatches.filter(({ agent: name }) => name === 'software-engineer')
  assert.equal(deliveries.length, 2)
  assert.match(deliveries[1].prompt, /unforeseen incident/i)
  assert.equal(host.events().filter(({ type, step }) => type === 'step.started' && step === 'gates').length, 2)
})

test('a judgment returned during the run cannot bypass usage validation through the human interaction path', async () => {
  const host = incidentHost()
  await host.start()
  host.human.ask = async () => judgment('RETRY')
  host.machine.exits['. $ dotnet test'] = 0

  assert.equal((await host.run()).status, 'done')

  const answer = host.events().filter(({ type }) => type === 'question.answered').at(-1)
  assert.deepEqual([answer.by, answer.model, answer.cost], ['host-llm', 'observed-test-model', 0.02])
})
