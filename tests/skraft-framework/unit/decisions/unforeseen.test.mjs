import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, green, scripted, SLUG, TRACKING, reworkCycle } from '../support/pipeline-host.mjs'

const incidentHost = () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 137 } })
  return scripted({ machine }, (host) => [agent()(host), agent()(host), agent()(host), agent({ work: green() })(host)])
}
const asked = (host) => host.events().filter(({ type }) => type === 'question.asked').at(-1)
const judgment = (answer, extra = {}) => ({ answer, by: 'host-llm', model: 'observed-test-model', cost: 0.02, costUnit: 'USD', ...extra })
test('an agent that stops without finishing asks the host LLM once for a recovery, whose retry dispatches the same attempt again; a person who stopped it still stops the run', async () => {
  const host = scripted({}, (it) => [() => ({ ok: false, text: '' }), agent()(it), () => ({ ok: false, unavailable: true, text: '' })])

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
