import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/pipeline/run-pipeline-usecase.mjs'
import { agent, API, scripted, SLUG } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

const QUESTION = 'Start this run with the configuration of this working copy? The Configuration tab of the skraft canvas and skraft doctor show it. ' +
  'START goes on, and is kept in skraft-config.local.json (configurationConfirmed) so that later runs start without asking; STOP starts nothing.'

const WORKFLOW = `digraph confirm {
  start           [shape=Mdiamond]
  publish_consent [shape=hexagon, question="publish-consent", phase="RESEARCH"]
  research        [shape=box, agent="solution-researcher"]
  exit            [shape=Msquare]
  start -> publish_consent -> research -> exit
}`

const LOCAL = 'skraft-config.local.json'

/** A run of WORKFLOW whose repository answered the pull request consent, unless config says otherwise. */
const confirming = (options = {}) => scripted({ config: { publish: { pullRequest: false } }, ...options, workflow: WORKFLOW }, (it) => [agent()(it)])

/** RunPipeline as a driver that confirms the configuration starts it. @param {ReturnType<typeof confirming>} host @param {'once' | 'always'} [confirm] */
const run = (host, confirm = 'once') => createRunPipeline(host.deps).run({ slug: SLUG, confirmConfiguration: confirm })

const started = async (host, confirm) => {
  assert.equal((await host.init()).ok, true)
  return run(host, confirm)
}

test('a working copy whose configuration nobody confirmed is asked once, before anything starts; START is kept in skraft-config.local.json and the run goes on', async () => {
  const host = confirming({ files: { [LOCAL]: JSON.stringify({ tdd: { replay: 'last-red' } }), '.gitignore': 'node_modules/\n' } })

  const waiting = await started(host)

  assert.deepEqual(waiting, { status: 'waiting', slug: SLUG, phase: null, code: 'configuration', reason: `${QUESTION} Answer with skraft decide configuration-1 START|STOP.` })
  assert.deepEqual(host.human.questions.map(({ key, kind, text, options, refusals, header }) => [key, kind, text, options, refusals, header]), [
    ['configuration-1', 'configuration', QUESTION, ['START', 'STOP'], [], 'Configuration'],
  ])
  assert.deepEqual(host.types(), ['run.started', 'question.asked'])
  assert.deepEqual(host.agentRunner.dispatches, [])
  assert.deepEqual(await run(host), waiting)
  assert.deepEqual(host.human.questions.map(({ key }) => key), ['configuration-1', 'configuration-1'])
  assert.deepEqual(host.human.shown, ['configuration', 'configuration'])
  assert.deepEqual(host.types(), ['run.started', 'question.asked'])

  assert.equal((await host.decide({ answer: 'start' })).ok, true)
  assert.equal((await run(host)).status, 'done')

  assert.deepEqual(JSON.parse(host.workspace.files.get(LOCAL)), { tdd: { replay: 'last-red' }, configurationConfirmed: true })
  assert.equal(host.workspace.files.get('.gitignore'), 'node_modules/\nskraft-config.local.json\n')
  assert.deepEqual(eventsOf(host, 'question.asked').map(({ key, step }) => [key, step]), [['configuration-1', 'configuration']])
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['configuration-1', 'START', 'decide']])
  assert.deepEqual(eventsOf(host, 'step.recorded').map(({ step }) => step), ['publish_consent', 'research'])
})

test('a working copy whose configuration a person confirmed starts without asking; a driver asking at each start asks again, and a run no driver asks to confirm asks nothing', async () => {
  const confirmed = confirming({ files: { [LOCAL]: JSON.stringify({ configurationConfirmed: true }) } })
  assert.equal((await started(confirmed)).status, 'done')
  assert.deepEqual([confirmed.human.questions, confirmed.human.shown], [[], []])

  const always = confirming({ files: { [LOCAL]: JSON.stringify({ configurationConfirmed: true }) }, answers: [{ answer: 'START' }] })
  assert.equal((await started(always, 'always')).status, 'done')
  assert.deepEqual(always.human.questions.map(({ key }) => key), ['configuration-1'])
  assert.deepEqual(eventsOf(always, 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['configuration-1', 'START', 'host']])

  const unasked = confirming()
  assert.equal((await unasked.start()).status, 'done')
  assert.deepEqual(unasked.human.questions, [])
  assert.equal(unasked.workspace.files.has(LOCAL), false)
})

test('STOP starts nothing and keeps nothing; the next start asks again', async () => {
  const host = confirming({ answers: [{ answer: 'stop' }, { answer: 'START' }] })

  const stopped = await started(host)

  assert.deepEqual(stopped, {
    status: 'refused', slug: SLUG, phase: null, code: 'configuration-stopped',
    reason: 'you chose not to start with this configuration; change it in the Configuration tab of the skraft canvas or in skraft-config.json, then start the pipeline again',
  })
  assert.deepEqual(host.types(), ['run.started', 'question.asked', 'question.answered'])
  assert.equal(host.workspace.files.has(LOCAL), false)
  assert.equal((await run(host)).status, 'done')
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer }) => [key, answer]), [['configuration-1', 'STOP'], ['configuration-2', 'START']])
})

test('the run goes on with the configuration as the person left it when they answered START', async () => {
  const host = confirming({ config: {} })
  host.human.answers.push(async () => {
    host.workspace.files.set('skraft-config.json', JSON.stringify({ components: [API], publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }))
    return { answer: 'START' }
  })

  assert.equal((await started(host)).status, 'done')

  assert.deepEqual(host.human.questions.map(({ key }) => key), ['configuration-1'])
  const consent = eventsOf(host, 'step.recorded')[0]
  assert.deepEqual([consent.step, consent.outcome, consent.answer], ['publish_consent', 'skipped', 'ACCEPTED'])
})

test('configurationConfirmed is true or false, in skraft-config.local.json only', async () => {
  const refusals = [
    [{ config: { configurationConfirmed: true } }, 'skraft-config.json is invalid: configurationConfirmed belongs in skraft-config.local.json, never in skraft-config.json'],
    [{ user: JSON.stringify({ configurationConfirmed: true }) }, '~/.skraft/config.json is invalid: configurationConfirmed belongs in skraft-config.local.json, never in ~/.skraft/config.json'],
    [{ files: { [LOCAL]: JSON.stringify({ configurationConfirmed: 'yes' }) } }, 'skraft-config.local.json is invalid: configurationConfirmed must be true or false'],
  ]
  for (const [options, reason] of refusals) {
    const initialised = await confirming(options).init()

    assert.deepEqual([initialised.ok, initialised.reason], [false, reason])
  }
})
