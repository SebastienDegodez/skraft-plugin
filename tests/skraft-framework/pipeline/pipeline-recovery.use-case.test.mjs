// Use-case tests: RunPipeline brings state.json back before it runs (recover-pipeline.mjs) —
// stale phase, corrupted or invalid state, a state rebuilt from the files on disk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRunPipeline } from '../../../plugins/skraft-framework/src/application/pipeline/run-pipeline.mjs'
import { requiredTrackedOutputs } from '../../../plugins/skraft-framework/src/domain/phase-gate-policy.mjs'
import { createFakeHost, CONFIG, TODAY, review, concretePath } from './fake-host.mjs'

const SLUG = 'checkout'
const STORY = { issue: 42, title: 'Pay by card' }
const P = CONFIG.phaseAgents

const runOnce = async (host, options = {}) => createRunPipeline(host.dependencies(SLUG)).run({ slug: SLUG, story: STORY, ...options })

// A healthy state whose RESEARCH and DESIGN are closed: the pipeline stopped before DISTILL.
const stateAtDistill = async () => {
  const host = createFakeHost()
  const outcome = await runOnce(host, { maxPhases: 2 })
  assert.equal(outcome.status, 'blocked')
  assert.equal(host.state(SLUG).currentPhase, 'DISTILL')
  return host.state(SLUG)
}

// What RESEARCH and DESIGN leave on disk, the DESIGN review APPROVED.
const researchAndDesignFiles = () => {
  const files = {}
  for (const agent of [P.RESEARCH.specialist, P.DESIGN.specialist]) {
    for (const pattern of requiredTrackedOutputs(agent, CONFIG)) files[concretePath(pattern, SLUG)] = `# ${agent} output`
  }
  files[`reviews/${TODAY}/design-review-1.md`] = review('NEEDS_REWORK')
  files[`reviews/${TODAY}/design-review-2.md`] = review('APPROVED')
  return files
}

test('recovery: a phase that spent its retry budget is relaunched with a fresh one once the human says so', async () => {
  const host = createFakeHost({
    verdicts: { DESIGN: ['NEEDS_REWORK', 'NEEDS_REWORK', 'NEEDS_REWORK'] },
    answers: { 'stale:DESIGN': ['relaunch'] },
  })
  const first = await runOnce(host)
  assert.equal(first.status, 'blocked')
  assert.match(first.reason, /retry budget exhausted/)

  const second = await runOnce(host)
  assert.equal(second.status, 'done')
  assert.deepEqual(host.questions.map((q) => q.key), [`stale:DESIGN:t2:r3`])
  assert.ok(host.logs.some((line) => /DESIGN gets a fresh retry budget/.test(line)))
})

test('recovery: "stop" at a stale phase stops without touching the budget', async () => {
  const host = createFakeHost({
    verdicts: { DESIGN: ['NEEDS_REWORK', 'NEEDS_REWORK', 'NEEDS_REWORK'] },
    answers: { 'stale:DESIGN': ['stop'] },
  })
  await runOnce(host)
  const dispatched = host.dispatches.length
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'blocked')
  assert.match(outcome.reason, /stopped by the human/)
  assert.equal(host.dispatches.length, dispatched)
  assert.equal(host.state(SLUG).retryCount.DESIGN, 2)
})

test('recovery: a stale phase nobody can answer for leaves the run awaiting the human', async () => {
  const host = createFakeHost({ verdicts: { DESIGN: ['NEEDS_REWORK', 'NEEDS_REWORK', 'NEEDS_REWORK'] } })
  await runOnce(host)
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'awaiting-human')
  assert.equal(outcome.checkpoint.key, 'stale:DESIGN:t2:r3')
})

test('recovery: a corrupted state.json rolls back to the newest healthy backup and resumes there', async () => {
  const raw = await stateAtDistill()
  const host = createFakeHost({
    states: { [SLUG]: 'corrupted' },
    backups: { [SLUG]: [{ name: 'state.json.bak.9', timestamp: 9, raw }, { name: 'state.json.bak.3', timestamp: 3, raw: null }] },
  })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  assert.equal(host.agentsCalled()[0], P.DISTILL.specialist)
  assert.ok(host.logs.some((line) => /restored state\.json\.bak\.9 \(DISTILL\)/.test(line)))
})

test('recovery: an invalid state without backup is kept aside, rebuilt, and the files on disk resume it once confirmed', async () => {
  const host = createFakeHost({
    states: { [SLUG]: { currentPhase: 42 } },
    files: { [SLUG]: researchAndDesignFiles() },
    answers: { recovery: ['resume'] },
  })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.archived, [SLUG])
  assert.deepEqual(host.questions.map((q) => q.key), ['recovery:RESEARCH,DESIGN'])
  assert.equal(host.agentsCalled()[0], P.DISTILL.specialist)
  const state = host.state(SLUG)
  assert.deepEqual(state.reviewArtifacts.DESIGN, [`reviews/${TODAY}/design-review-2.md`])
  assert.deepEqual(state.phasesCompleted, ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
})

test('recovery: "restart" runs every phase again', async () => {
  const host = createFakeHost({
    states: { [SLUG]: 'corrupted' },
    files: { [SLUG]: researchAndDesignFiles() },
    answers: { recovery: ['restart'] },
  })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  assert.equal(host.agentsCalled()[0], P.RESEARCH.specialist)
})

test('recovery: a missing state.json with files on disk asks before recording them; a fresh pipeline asks nothing', async () => {
  const resumed = createFakeHost({ files: { [SLUG]: researchAndDesignFiles() } })
  const outcome = await runOnce(resumed)
  assert.equal(outcome.status, 'awaiting-human')
  assert.equal(outcome.checkpoint.key, 'recovery:RESEARCH,DESIGN')
  assert.equal(resumed.dispatches.length, 0)

  const fresh = createFakeHost()
  await runOnce(fresh)
  assert.deepEqual(fresh.questions, [])
})

test('recovery: a DESIGN whose newest review is not APPROVED is where the pipeline resumes', async () => {
  const files = researchAndDesignFiles()
  files[`reviews/${TODAY}/design-review-3.md`] = review('NEEDS_REWORK')
  const host = createFakeHost({ states: { [SLUG]: 'corrupted' }, files: { [SLUG]: files }, answers: { recovery: ['resume'] } })
  await runOnce(host)

  assert.deepEqual(host.questions.map((q) => q.key), ['recovery:RESEARCH'])
  assert.equal(host.agentsCalled()[0], P.DESIGN.specialist)
})
