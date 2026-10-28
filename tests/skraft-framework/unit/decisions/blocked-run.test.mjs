import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, scripted, SLUG, tddCycle, TRACKING } from '../support/pipeline-host.mjs'
import { dispatched, eventsOf } from '../support/decisions.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const INSTRUCTION = 'Use the bank gateway of Acme'
const NO_PROVIDER = 'The story names no payment provider.'
const blockedAgent = (it) => agent({ result: { status: 'blocked', summary: NO_PROVIDER } })(it)
const RESEARCH_BLOCKED = `research is blocked: solution-researcher says it cannot go on; its reason is in ${TRACKING}/results/research-1-1.json. An instruction runs research again on a new pass with it; STOP ends the run.`

test('an agent that says it is blocked asks a human what to do instead of ending the run', async () => {
  const host = scripted({}, (it) => [blockedAgent(it)])

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'waiting', slug: SLUG, phase: 'RESEARCH', code: 'blocked', reason: `${RESEARCH_BLOCKED} Answer with skraft decide research-1 "<instruction>"|STOP.` })
  assert.deepEqual(host.human.questions, [{ key: 'research-1', kind: 'blocked', text: RESEARCH_BLOCKED, options: ['STOP'], refusals: [], header: 'Blocked' }])
  const [{ key, kind, step, visit, subjects }] = eventsOf(host, 'question.asked')
  assert.deepEqual({ key, kind, step, visit, subjects }, { key: 'research-1', kind: 'blocked', step: 'research', visit: 1, subjects: [] })
  assert.equal(host.types().at(-1), 'question.asked')
  assert.equal((await host.view()).status, 'waiting')
})

test('an instruction runs the blocked node again on a new pass of the same run, with the instruction in its brief', async () => {
  const host = scripted({}, (it) => [blockedAgent(it), agent()(it), unavailable])
  await host.start()

  const decided = await host.decide({ key: 'research-1', answer: '  Use the bank gateway\n of Acme ' })
  const outcome = await host.run()

  assert.deepEqual(decided, { ok: true, slug: SLUG, key: 'research-1', code: null, reason: `${SLUG}: research-1 answered ${INSTRUCTION}; run the pipeline again to go on` })
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['blocked', 'DESIGN', 'agent-unavailable'])
  assert.deepEqual(dispatched(host), [`skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · research · pass 2 · attempt 1`, `skraft ${SLUG} · design · attempt 1`])
  const brief = host.agentRunner.dispatches[1].prompt
  assert.ok(brief.includes('- Pass: 2, after a human refused the work'), brief)
  assert.ok(brief.endsWith(`\n\nA human refused the work of pass 1:\n- ${INSTRUCTION}`), brief)
  assert.deepEqual(eventsOf(host, 'step.started').filter((event) => event.step === 'research').map(({ visit, attempt, feedback, sentBy }) => [visit, attempt, feedback, sentBy]), [
    [1, 1, [], undefined],
    [2, 1, [INSTRUCTION], 'ask'],
  ])
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer, reason, by }) => [key, answer, reason, by]), [['research-1', INSTRUCTION, null, 'decide']])
  assert.equal(eventsOf(host, 'run.started').length, 1)
})

test('a loop that reached its max_visits asks a human; an instruction runs the node it loops back to again, its loop budget reset', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 } })
  const passes = [1, 2, 3, 4, 5, 6].map((n) => (it) => agent({ work: (h) => { if (n === 6) machine.exits['. $ dotnet test'] = 0; tddCycle(SLUG, `Pass${n}`)(h) } })(it))
  const host = scripted({ machine }, (it) => [agent()(it), agent()(it), agent()(it), ...passes.map((pass) => pass(it))])

  const waiting = await host.start()
  await host.decide({ answer: 'Mock the bank gateway in the tests' })
  const outcome = await host.run()

  const text = 'deliver is blocked: gates -> deliver was taken as often as its max_visits allows. An instruction runs deliver again on a new pass with it; STOP ends the run.'
  assert.deepEqual(waiting, { status: 'waiting', slug: SLUG, phase: 'DELIVER', code: 'blocked', reason: `${text} Answer with skraft decide deliver-1 "<instruction>"|STOP.` })
  assert.deepEqual(eventsOf(host, 'question.asked').map(({ key, step, visit, text: asked }) => [key, step, visit, asked]), [['deliver-1', 'deliver', 4, text]])
  assert.equal(outcome.status, 'done')
  assert.deepEqual(eventsOf(host, 'step.recorded').filter((event) => event.step === 'gates').map(({ visit, outcome: result, code, next }) => [visit, result, code, next]), [
    [1, 'fail', null, 'deliver'], [2, 'fail', null, 'deliver'], [3, 'fail', null, 'deliver'], [4, 'fail', 'loop-ceiling', null], [5, 'fail', null, 'deliver'], [6, 'pass', null, 'mutation'],
  ])
  const resumed = host.agentRunner.dispatches.find((dispatch) => dispatch.label === `skraft ${SLUG} · deliver · pass 5 · attempt 1`)
  assert.ok(resumed.prompt.endsWith('\n\nA human refused the work of pass 4:\n- Mock the bank gateway in the tests'), resumed.prompt)
})
