import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost } from '../support/in-memory-host.mjs'
import { agent, API, scripted, SLUG } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

const CONSENT = 'May skraft push this branch and open or update its pull request when a run ends, and keep one comment on its story\'s issue up to date with the run\'s progress, time and cost? ' +
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
  assert.deepEqual(eventsOf(host, 'question.asked').map(({ key, subjects }) => [key, subjects]), [['publish_consent-1', []]])
  assert.deepEqual(host.human.questions.map(({ key, text, options, refusals, header }) => [key, text, options, refusals, header]), [
    ['publish_consent-1', CONSENT, ['ACCEPTED', 'DECLINED'], [], 'Pull request'],
  ])

  assert.equal((await host.decide({ answer: 'accepted' })).ok, true)
  assert.equal((await host.run()).status, 'done')

  assert.deepEqual(host.workspace.config(), { components: [API], publish: { visuals: false, pullRequest: true, questionVersions: { pullRequest: 2 } } })
  assert.deepEqual(eventsOf(host, 'step.recorded').map(({ step, outcome, answer, next }) => [step, outcome, answer ?? null, next]), [
    ['publish_consent', 'answered', 'ACCEPTED', 'research'],
    ['research', 'done', null, 'exit'],
  ])
})

test('a repository that already answered is not asked again; DECLINED in a dialog is kept too', async () => {
  for (const pullRequest of [true, false]) {
    const host = consenting({ config: { publish: { pullRequest, questionVersions: { pullRequest: 2 } } } })

    assert.equal((await host.start()).status, 'done')

    assert.deepEqual(host.human.questions, [])
    const { outcome, answer, reason } = eventsOf(host, 'step.recorded')[0]
    assert.deepEqual({ outcome, answer, reason }, { outcome: 'skipped', answer: pullRequest ? 'ACCEPTED' : 'DECLINED', reason: `skraft-config.json sets publish.pullRequest to ${pullRequest}` })
  }

  const declined = consenting({ answers: [{ answer: 'DECLINED' }] })
  assert.equal((await declined.start()).status, 'done')
  assert.deepEqual(declined.workspace.config().publish, { pullRequest: false })
})

test('an acceptance kept for an earlier text of the question is asked again, its answer kept with the version it answers; a refusal of an earlier text stands', async () => {
  for (const publish of [{ pullRequest: true }, { pullRequest: true, questionVersions: { pullRequest: 1 } }]) {
    const host = consenting({ config: { publish } })

    assert.equal((await host.start()).status, 'waiting')
    assert.deepEqual(host.human.questions.map(({ text }) => text), [CONSENT])
    assert.equal((await host.decide({ answer: 'ACCEPTED' })).ok, true)
    assert.equal((await host.run()).status, 'done')
    assert.deepEqual(host.workspace.config().publish, { pullRequest: true, questionVersions: { pullRequest: 2 } })
  }

  const refused = consenting({ config: { publish: { pullRequest: false, questionVersions: { pullRequest: 1 } } } })
  assert.equal((await refused.start()).status, 'done')
  assert.deepEqual(refused.human.questions, [])
})

test('the version of the question each answer was given to is a whole number from 1, for visuals or pullRequest; anything else makes skraft-config.json invalid', async () => {
  for (const questionVersions of [{ pullRequest: 0 }, { pullRequest: 1.5 }, { pullRequest: '2' }, { draft: 1 }, { pullRequest: 2, draft: 1 }, [2]]) {
    const initialised = await consenting({ config: { publish: { pullRequest: true, questionVersions } } }).init()

    assert.deepEqual([initialised.ok, initialised.reason], [false, 'skraft-config.json is invalid: publish.questionVersions must be an object of visuals, pullRequest and reviewComment, each a whole number from 1'])
  }
  assert.equal((await consenting({ config: { publish: { questionVersions: { visuals: 1, pullRequest: 3 } } } }).init()).ok, true)
})

test('publish takes visuals, pullRequest, reviewComment and draft, each true or false; anything else makes skraft-config.json invalid', async () => {
  for (const publish of [{ draft: 'no' }, { pullRequest: 1 }, { reviewers: true }, true]) {
    const initialised = await consenting({ config: { publish } }).init()

    assert.deepEqual([initialised.ok, initialised.reason], [false, 'skraft-config.json is invalid: publish must be an object of visuals, pullRequest, reviewComment and draft, each true or false'])
  }
  assert.equal((await consenting({ config: { publish: { visuals: true, pullRequest: false, draft: false } } }).init()).ok, true)
})

const NO_GH = 'gh, the GitHub CLI, is not installed'
const UNREACHABLE = `publish_consent cannot run on this machine: ${NO_GH}. Fix it, then RETRY; or ABORT the run.`

test('a consent to publish, kept or given now, on a machine that cannot reach the forge asks to fix it before the first agent; RETRY once fixed goes on', async () => {
  const kept = consenting({ config: { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }, codeHost: new InMemoryCodeHost({ unavailable: NO_GH }) })
  const given = consenting({ config: { publish: { visuals: false } }, codeHost: new InMemoryCodeHost({ unavailable: NO_GH }) })

  const waiting = await kept.start()
  assert.equal((await given.start()).code, 'publish-consent')
  assert.equal((await given.decide({ answer: 'accepted' })).ok, true)
  const answered = await given.run()

  for (const [host, outcome] of [[kept, waiting], [given, answered]]) {
    assert.deepEqual(outcome, { status: 'waiting', slug: SLUG, phase: 'RESEARCH', code: 'environment', reason: `${UNREACHABLE} Answer with skraft decide publish_consent-${host === kept ? 1 : 2} RETRY|ABORT.` })
    assert.deepEqual(host.agentRunner.dispatches, [])
    host.codeHost.missing = null
    assert.equal((await host.decide({ answer: 'retry' })).ok, true)
    assert.equal((await host.run()).status, 'done')
    assert.deepEqual(eventsOf(host, 'step.recorded').map(({ step, answer }) => [step, answer ?? null]), [['publish_consent', 'ACCEPTED'], ['research', null]])
  }
  assert.equal(given.workspace.config().publish.pullRequest, true)
})

test('a consent declined, kept or given now, checks no forge: the run goes on without it', async () => {
  const kept = consenting({ config: { publish: { pullRequest: false } }, codeHost: new InMemoryCodeHost({ unavailable: NO_GH }) })
  const given = consenting({ config: { publish: { visuals: false } }, codeHost: new InMemoryCodeHost({ unavailable: NO_GH }), answers: [{ answer: 'DECLINED' }] })

  assert.equal((await kept.start()).status, 'done')
  assert.equal((await given.start()).status, 'done')

  assert.deepEqual(kept.human.questions, [])
  assert.deepEqual(given.human.questions.map(({ key }) => key), ['publish_consent-1'])
  assert.equal(given.workspace.config().publish.pullRequest, false)
})
