import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, scripted } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

const CONSENT = 'May skraft push this branch and open or update its pull request when a run ends? ' +
  'ACCEPTED or DECLINED; the answer is kept in skraft-config.json (publish.pullRequest) for every later run.'

const WORKFLOW = `digraph consent {
  start           [shape=Mdiamond]
  publish_consent [shape=hexagon, question="publish-consent", phase="RESEARCH"]
  research        [shape=box, agent="solution-researcher"]
  exit            [shape=Msquare]
  start -> publish_consent -> research -> exit
}`

const consenting = (options) => scripted({ ...options, workflow: WORKFLOW }, (it) => [agent()(it)])

test('the consent to open the pull request is asked once, before the first agent; the answer goes into skraft-config.json, every other key kept', async () => {
  const host = consenting({ config: { publish: { visuals: false } } })

  const waiting = await host.start()
  assert.deepEqual({ status: waiting.status, code: waiting.code, phase: waiting.phase }, { status: 'waiting', code: 'publish-consent', phase: 'RESEARCH' })
  assert.deepEqual(host.agentRunner.dispatches, [])
  assert.deepEqual(host.human.questions.map(({ key, text, options, refusals, header }) => [key, text, options, refusals, header]), [
    ['publish_consent-1', CONSENT, ['ACCEPTED', 'DECLINED'], [], 'Pull request'],
  ])

  assert.equal((await host.decide({ answer: 'accepted' })).ok, true)
  assert.equal((await host.run()).status, 'done')

  assert.deepEqual(host.workspace.config(), { components: [API], publish: { visuals: false, pullRequest: true } })
  assert.deepEqual(eventsOf(host, 'step.recorded').map(({ step, outcome, answer, next }) => [step, outcome, answer ?? null, next]), [
    ['publish_consent', 'answered', 'ACCEPTED', 'research'],
    ['research', 'done', null, 'exit'],
  ])
})

test('a repository that already answered is not asked again; DECLINED in a dialog is kept too', async () => {
  for (const pullRequest of [true, false]) {
    const host = consenting({ config: { publish: { pullRequest } } })

    assert.equal((await host.start()).status, 'done')

    assert.deepEqual(host.human.questions, [])
    const { outcome, answer, reason } = eventsOf(host, 'step.recorded')[0]
    assert.deepEqual({ outcome, answer, reason }, { outcome: 'skipped', answer: pullRequest ? 'ACCEPTED' : 'DECLINED', reason: `skraft-config.json sets publish.pullRequest to ${pullRequest}` })
  }

  const declined = consenting({ answers: [{ answer: 'DECLINED' }] })
  assert.equal((await declined.start()).status, 'done')
  assert.deepEqual(declined.workspace.config().publish, { pullRequest: false })
})

test('publish takes visuals, pullRequest and draft, each true or false; anything else makes skraft-config.json invalid', async () => {
  for (const publish of [{ draft: 'no' }, { pullRequest: 1 }, { reviewers: true }, true]) {
    const initialised = await consenting({ config: { publish } }).init()

    assert.deepEqual([initialised.ok, initialised.reason], [false, 'skraft-config.json is invalid: publish must be an object of visuals, pullRequest and draft, each true or false'])
  }
  assert.equal((await consenting({ config: { publish: { visuals: true, pullRequest: false, draft: false } } }).init()).ok, true)
})
