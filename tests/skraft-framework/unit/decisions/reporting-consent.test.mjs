import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, scripted } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

const CONSENT = 'May skraft publish the screenshots and videos of its runs in the pull request of the branch? They can show private data. ' +
  'ACCEPTED or DECLINED; the answer is kept in skraft-config.json for every later run.'

const WORKFLOW = `digraph consent {
  start    [shape=Mdiamond]
  research [shape=box, agent="solution-researcher", phase="RESEARCH"]
  consent  [shape=hexagon, question="reporting-consent"]
  exit     [shape=Msquare]
  start -> research -> consent -> exit
}`

const consenting = (options) => scripted({ ...options, workflow: WORKFLOW }, (it) => [agent()(it)])

test('the consent to publish visuals is asked once; the answer goes into skraft-config.json, every other key kept', async () => {
  const host = consenting({ config: { tdd: { replay: 'last-red' } } })

  const waiting = await host.start()
  assert.deepEqual({ status: waiting.status, code: waiting.code }, { status: 'waiting', code: 'reporting-consent' })
  assert.deepEqual(host.human.questions.map(({ key, text, options, refusals }) => [key, text, options, refusals]), [['consent-1', CONSENT, ['ACCEPTED', 'DECLINED'], []]])

  assert.equal((await host.decide({ answer: 'accepted' })).ok, true)
  assert.equal((await host.run()).status, 'done')

  assert.deepEqual(host.workspace.config(), { tdd: { replay: 'last-red' }, components: [API], publish: { visuals: true } })
  assert.deepEqual(eventsOf(host, 'step.recorded').at(-1), { ...eventsOf(host, 'step.recorded').at(-1), step: 'consent', outcome: 'answered', answer: 'ACCEPTED', next: 'exit' })
})

test('a repository that already answered is not asked again, whatever it answered', async () => {
  for (const visuals of [true, false]) {
    const host = consenting({ config: { publish: { visuals } } })

    assert.equal((await host.start()).status, 'done')

    assert.deepEqual(host.human.questions, [])
    const recorded = eventsOf(host, 'step.recorded').at(-1)
    assert.deepEqual({ outcome: recorded.outcome, answer: recorded.answer, reason: recorded.reason }, {
      outcome: 'skipped', answer: visuals ? 'ACCEPTED' : 'DECLINED', reason: `skraft-config.json sets publish.visuals to ${visuals}`,
    })
  }
})

test('DECLINED is kept too, and the run goes on', async () => {
  const host = consenting({ answers: [{ answer: 'DECLINED' }] })

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(host.workspace.config().publish, { visuals: false })
})

test('the answer holds for the rest of the run: a loop back through the consent node does not ask again, from a dialog or after skraft decide', async () => {
  const loop = `digraph consent {
    start    [shape=Mdiamond]
    research [shape=box, agent="solution-researcher", phase="RESEARCH"]
    consent  [shape=hexagon, question="reporting-consent"]
    gates    [shape=parallelogram, gate="build", goal_gate=true]
    exit     [shape=Msquare]
    start -> research -> consent -> gates
    gates -> research [label="FAIL", max_visits=1]
    gates -> exit [label="PASS"]
  }`
  const failingBuild = () => new ScriptedMachine({ exits: { '. $ dotnet build': 1 } })
  const consentSteps = (host) => eventsOf(host, 'step.recorded').filter(({ step }) => step === 'consent').map(({ visit, outcome, answer }) => [visit, outcome, answer])

  const inDialog = scripted({ workflow: loop, machine: failingBuild(), answers: [{ answer: 'ACCEPTED' }] }, (it) => [agent()(it), agent()(it)])
  await inDialog.start()
  assert.deepEqual(inDialog.human.questions.map(({ key }) => key), ['consent-1'])
  assert.deepEqual(consentSteps(inDialog), [[1, 'answered', 'ACCEPTED'], [2, 'skipped', 'ACCEPTED']])
  assert.deepEqual(inDialog.workspace.config().publish, { visuals: true })

  const decided = scripted({ workflow: loop, machine: failingBuild() }, (it) => [agent()(it), agent()(it)])
  assert.equal((await decided.start()).code, 'reporting-consent')
  assert.equal((await decided.decide({ answer: 'DECLINED' })).ok, true)
  await decided.run()
  assert.deepEqual(decided.human.questions.map(({ key }) => key), ['consent-1'])
  assert.deepEqual(consentSteps(decided), [[1, 'answered', 'DECLINED'], [2, 'skipped', 'DECLINED']])
  assert.deepEqual(decided.workspace.config().publish, { visuals: false })
})

test('a publish key that is not { visuals: boolean } makes skraft-config.json invalid', async () => {
  const host = consenting({ config: { publish: { visuals: 'yes' } } })

  const initialised = await host.init()

  assert.equal(initialised.ok, false)
  assert.equal(initialised.reason, 'skraft-config.json is invalid: publish must be { "visuals": true or false }')
})
