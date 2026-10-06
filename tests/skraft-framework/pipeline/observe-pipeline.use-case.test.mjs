// Use-case tests of ObservePipeline (src/application/pipeline/observe-pipeline.mjs): the view
// a person following a pipeline sees, built from what RunPipeline left on disk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRunPipeline } from '../../../plugins/skraft-framework/src/application/pipeline/run-pipeline.mjs'
import { createObservePipeline } from '../../../plugins/skraft-framework/src/application/pipeline/observe-pipeline.mjs'
import { createFakeHost, CONFIG, TODAY, review } from './fake-host.mjs'

const SLUG = 'checkout'
const STORY = { issue: 42, title: 'Pay by card' }
const P = CONFIG.phaseAgents
const runOnce = (host) => createRunPipeline(host.dependencies(SLUG)).run({ slug: SLUG, story: STORY })
const observe = (host) => createObservePipeline(host.dependencies(SLUG))

test('observe: a pipeline not started yet is a view with every phase pending', async () => {
  const view = await observe(createFakeHost()).snapshot(SLUG)
  assert.equal(view.started, false)
  assert.equal(view.run, null)
  assert.deepEqual(view.phases.map((p) => [p.name, p.status]), [['RESEARCH', 'pending'], ['DESIGN', 'pending'], ['DISTILL', 'pending'], ['DELIVER', 'pending']])
})

test('observe: a run waiting for the human shows the open phase awaiting, its question, attempts and reviews', async () => {
  const host = createFakeHost({ verdicts: { DESIGN: ['NEEDS_REWORK', 'REJECTED'] } })
  await runOnce(host)
  const view = await observe(host).snapshot(SLUG)

  assert.equal(view.currentPhase, 'DESIGN')
  assert.deepEqual(view.story, STORY)
  assert.deepEqual(view.phases.map((p) => p.status), ['done', 'awaiting', 'pending', 'pending'])
  const design = view.phases[1]
  assert.equal(design.specialist, P.DESIGN.specialist)
  assert.equal(design.attempt, 2)
  assert.equal(design.maxAttempts, 3)
  assert.deepEqual(design.reviews.map((r) => [r.path, r.verdict]), [
    [`reviews/${TODAY}/design-review-1.md`, 'NEEDS_REWORK'],
    [`reviews/${TODAY}/design-review-2.md`, 'REJECTED'],
  ])
  assert.ok(design.artifacts.length > 0)
  assert.equal(design.startedAt, `${TODAY}T10:00:00.000Z`)
  assert.deepEqual(view.checkpoint, { key: 'rejected:DESIGN:2', question: view.checkpoint.question, options: ['rework', 'stop'], answered: false })
  assert.equal(view.run.status, 'awaiting-human')
  assert.ok(view.run.log.length > 0)
})

test('observe: an answer recorded since shows the checkpoint answered, and the decision listed', async () => {
  const host = createFakeHost({ verdicts: { DESIGN: ['REJECTED'] } })
  await runOnce(host)
  await host.dependencies(SLUG).decisionStore.write(SLUG, 'rejected:DESIGN:1', 'rework', 'human')
  const view = await observe(host).snapshot(SLUG)
  assert.equal(view.checkpoint.answered, true)
  assert.deepEqual(view.decisions.find((d) => d.key === 'rejected:DESIGN:1'), { key: 'rejected:DESIGN:1', answer: 'rework', by: 'human', at: `${TODAY}T10:00:00.000Z` })
})

test('observe: a pipeline done shows every phase done, its reports and their publications', async () => {
  const forecast = {
    kind: 'forecast', story: SLUG, title: 'Pay by card', revision: 'a'.repeat(40), language: 'en',
    impact: { expected: 'Card payments accepted' }, criteria: [{ id: 'AC-1', description: 'Pay', test: 'pays' }],
    limitations: [], media: [], maxMedia: 0,
  }
  const host = createFakeHost({ consent: 'pr pr=#12', reportData: { forecast } })
  await runOnce(host)
  const view = await observe(host).snapshot(SLUG)

  assert.equal(view.done, true)
  assert.deepEqual(view.phases.map((p) => p.status), ['done', 'done', 'done', 'done'])
  assert.equal(view.run.status, 'done')
  assert.deepEqual(view.reporting.destinations, { pr: true, issue: 'none', chat: false })
  assert.deepEqual(view.reporting.reports, [{ kind: 'forecast', date: TODAY, path: `reporting/${TODAY}/forecast.md` }])
  assert.deepEqual(view.reporting.publications.map((p) => [p.kind, p.destination, p.status, p.number]), [['forecast', 'pr', 'published', 12]])
  assert.match(view.reporting.publications[0].url, /^https:\/\/github\.com\/acme\/shop\/pull\/12#issuecomment-\d+$/)
  assert.equal(view.reporting.pending, null)
})

test('observe: a viewer opens a review or a report, never state.json nor a path off the list', async () => {
  const host = createFakeHost({ reviews: { DESIGN: [review('APPROVED', { findings: 'All good.' })] } })
  await runOnce(host)
  const observer = observe(host)
  assert.match(await observer.readTracked(SLUG, `reviews/${TODAY}/design-review-1.md`), /All good\./)
  assert.equal(await observer.readTracked(SLUG, 'state.json'), null)
  assert.equal(await observer.readTracked(SLUG, '../../etc/passwd'), null)
  assert.equal(await observer.readTracked(SLUG, `reviews/${TODAY}/missing.md`), null)
})

test('observe: a pipeline shows its steps checked, its tests and what each agent cost', async () => {
  const host = createFakeHost({ gates: ['fail', 'pass'] })
  await runOnce(host)
  const view = await createObservePipeline({ ...host.dependencies(SLUG), pricing: { eurPerUsd: 0.9 } }).snapshot(SLUG)

  assert.ok(view.phases.every((phase) => phase.steps.at(-1).status === 'done'))
  assert.deepEqual(view.phases[3].steps.map((s) => s.id), ['outputs', 'quality-gates', 'review', 'outcome-report', 'closed'])
  assert.equal(view.phases[3].steps[1].status, 'done', 'the last check passed')
  assert.equal(view.tests.evidenceLog, `evidence/${TODAY}/s1/qg-s1.json`)
  assert.deepEqual(view.tests.tests, { total: 45, passed: 45, failed: 0 })
  assert.equal(view.tests.verdict, 'pass')
  assert.equal(view.tests.gates.length, 9)
  assert.equal(view.cost.total.dispatches, 8, 'engineer twice: the failed check sent it back')
  assert.equal(view.cost.total.credits, 10)
  assert.equal(view.cost.total.usd, 0.1)
  assert.equal(view.cost.total.eur, 0.09)
  assert.deepEqual(view.cost.byPhase.map((p) => p.dispatches), [1, 2, 2, 3])
  const journal = JSON.parse(host.tracking(SLUG, 'run.json'))
  assert.ok(journal.log.some((l) => l.message === `quality gates evidence/${TODAY}/s1/qg-s1.json: fail`))
  assert.equal(journal.dispatches[0].phase, 'RESEARCH')
  assert.equal(journal.dispatches[0].usage.credits, 1.25)
})

test('observe: a host that reports no usage shows the agents run and no amount', async () => {
  const host = createFakeHost({ usage: false })
  await runOnce(host)
  const view = await observe(host).snapshot(SLUG)
  assert.equal(view.cost.total.dispatches, 7)
  assert.equal(view.cost.total.reported, 0)
  assert.equal(view.cost.total.usd, null)
  assert.equal(view.cost.eurPerUsd, null)
})

test('observe: locate finds the pipeline of the current branch, else lists the pipelines to choose from', async () => {
  const host = createFakeHost({ branch: 'feat/42-checkout' })
  await runOnce(host)
  const observer = observe(host)
  assert.deepEqual(await observer.locate(), { slug: SLUG, reason: 'branch', chooser: null }, 'the run recorded the branch it started on')
  assert.deepEqual((await observer.pipelines()).map((p) => [p.slug, p.branch, p.story?.issue]), [[SLUG, 'feat/42-checkout', 42]])
  assert.deepEqual(await observer.locate('refund'), { slug: 'refund', reason: 'requested', chooser: null })

  const empty = createObservePipeline(createFakeHost({ branch: 'main' }).dependencies(SLUG))
  const located = await empty.locate()
  assert.equal(located.slug, null)
  assert.deepEqual(located.chooser, { chooser: true, branch: 'main', reason: 'none', pipelines: [] })
})
