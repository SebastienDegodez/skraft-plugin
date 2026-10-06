// Use-case tests of the host-neutral orchestrator (src/application/pipeline/run-pipeline.mjs),
// driven through an in-memory host whose "LLM" is scripted (fake-host.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRunPipeline } from '../../../plugins/skraft-framework/src/application/pipeline/run-pipeline.mjs'
import { evaluateHandoff } from '../../../plugins/skraft-framework/src/domain/handoff-policy.mjs'
import { createFakeHost, CONFIG, TODAY, review, ADR_INDEX_HEADER } from './fake-host.mjs'

const SLUG = 'checkout'
const STORY = { issue: 42, title: 'Pay by card' }
const P = CONFIG.phaseAgents

const runOnce = async (host) => createRunPipeline(host.dependencies(SLUG)).run({ slug: SLUG, story: STORY })

test('run-pipeline: every phase approved — dispatches each specialist then its reviewer and reaches DONE', async () => {
  const host = createFakeHost()
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.agentsCalled(), [
    P.RESEARCH.specialist,
    P.DESIGN.specialist, P.DESIGN.reviewer,
    P.DISTILL.specialist, P.DISTILL.reviewer,
    P.DELIVER.specialist, P.DELIVER.reviewer,
  ])
  const state = host.state(SLUG)
  assert.equal(state.currentPhase, 'DONE')
  assert.deepEqual(state.phasesCompleted, ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
  assert.deepEqual(state.reviewArtifacts.DESIGN, [`reviews/${TODAY}/design-review-1.md`])
  assert.deepEqual(host.phases, ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
})

test('run-pipeline: the structural scan runs once, before the architect, and is recorded under RESEARCH', async () => {
  const host = createFakeHost()
  await runOnce(host)

  assert.equal(host.scans.length, 1)
  const report = JSON.parse(host.tracking(SLUG, `details/${TODAY}/structural-scan.json`))
  assert.equal(report.revision, 'sha1')
  assert.equal(report.scannedFiles, 1)
  assert.equal(report.generatedAt, `${TODAY}T10:00:00.000Z`)
  assert.ok(host.state(SLUG).phaseArtifacts.RESEARCH.includes(`details/${TODAY}/structural-scan.json`))
})

test('run-pipeline: every dispatch satisfies the handoff guard (G9) and names the story and scope', async () => {
  const host = createFakeHost()
  const seen = []
  const dependencies = host.dependencies(SLUG)
  const original = dependencies.agentRunner.run
  dependencies.agentRunner.run = async (dispatch) => {
    const state = await dependencies.stateReader.read(SLUG)
    seen.push({ dispatch, verdict: evaluateHandoff({ agent: dispatch.agent, state, config: CONFIG, prompt: dispatch.prompt }) })
    return original(dispatch)
  }
  await createRunPipeline(dependencies).run({ slug: SLUG, story: STORY })

  assert.equal(seen.length, 7)
  for (const { dispatch, verdict } of seen) {
    assert.equal(verdict.ok, true, `${dispatch.agent}: ${verdict.error?.reason}`)
    assert.match(dispatch.prompt, /#42 — Pay by card/)
    assert.match(dispatch.prompt, /Feature scope: checkout/)
    assert.match(dispatch.prompt, /### Handoff \(from `state\.mjs handoff`/)
  }
})

test('run-pipeline: DELIVER verifies the evidence log in process, against the commits made since the base recorded at phase start', async () => {
  const host = createFakeHost()
  await runOnce(host)

  assert.deepEqual(host.ranges, [{ base: host.state(SLUG).phaseHistory.DELIVER.baseSha, rev: 'sha2' }])
  assert.ok(host.logs.includes(`qg-verify evidence/${TODAY}/s1/qg-s1.json: pass`))
})

test('run-pipeline: an evidence log the engineer altered is inconclusive, not a pass', async () => {
  const host = createFakeHost({ gates: ['inconclusive'], answers: { 'environment:DELIVER': [null] } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'awaiting-human')
  assert.match(host.questions[0].question, /STDOUT_MISSING/)
})

test('run-pipeline: NEEDS_REWORK sends the findings back to the specialist, then re-reviews', async () => {
  const host = createFakeHost({
    reviews: { DISTILL: [review('NEEDS_REWORK', { findings: 'G4: scenario 2 has no Then step' })] },
  })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  const designer = host.dispatches.filter((d) => d.agent === P.DISTILL.specialist)
  assert.equal(designer.length, 2)
  assert.match(designer[1].prompt, /Reviewer findings \(attempt 2 of 3\)/)
  assert.match(designer[1].prompt, /G4: scenario 2 has no Then step/)
  assert.match(designer[1].prompt, new RegExp(`reviews/${TODAY}/distill-review-1\\.md`))
  assert.equal(host.state(SLUG).retryCount.DISTILL, 1)
  assert.deepEqual(host.state(SLUG).reviewArtifacts.DISTILL, [`reviews/${TODAY}/distill-review-1.md`, `reviews/${TODAY}/distill-review-2.md`])
})

test('run-pipeline: a phase whose reviewer never approves stops after maxRetriesPerPhase + 1 attempts', async () => {
  const host = createFakeHost({ verdicts: { DESIGN: ['NEEDS_REWORK', 'NEEDS_REWORK', 'NEEDS_REWORK', 'NEEDS_REWORK'] } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.phase, 'DESIGN')
  assert.match(outcome.reason, /retry budget exhausted \(3 attempts\)/)
  assert.equal(host.dispatches.filter((d) => d.agent === P.DESIGN.specialist).length, 3)
  assert.equal(host.state(SLUG).currentPhase, 'DESIGN')
})

test('run-pipeline: a missing required artefact is a rework without spending a review', async () => {
  const host = createFakeHost({ skipOutputs: { [P.RESEARCH.specialist]: 1 } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  const researcher = host.dispatches.filter((d) => d.agent === P.RESEARCH.specialist)
  assert.equal(researcher.length, 2)
  assert.match(researcher[1].prompt, /Artefact missing: research\/\{date\}\/\{slug\}-research\.md/)
})

test('run-pipeline: failed quality gates go back to the engineer before any review', async () => {
  const host = createFakeHost({ gates: ['fail', 'pass'] })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  const engineer = host.dispatches.filter((d) => d.agent === P.DELIVER.specialist)
  assert.equal(engineer.length, 2)
  assert.match(engineer[1].prompt, /qg-verify failed — fix these before review/)
  assert.equal(host.dispatches.filter((d) => d.agent === P.DELIVER.reviewer).length, 1)
})

test('run-pipeline: inconclusive quality gates ask the human; "fixed" re-gates the engineer without a retry', async () => {
  const host = createFakeHost({ gates: ['inconclusive', 'pass'], answers: { 'environment:DELIVER': ['fixed'] } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  const engineer = host.dispatches.filter((d) => d.agent === P.DELIVER.specialist)
  assert.equal(engineer.length, 2)
  assert.match(engineer[1].prompt, /## Environment re-gate/)
  assert.equal(host.state(SLUG).retryCount.DELIVER ?? 0, 0)
})

test('run-pipeline: an environment escalation from a DESIGN review re-dispatches the reviewer only', async () => {
  const host = createFakeHost({
    reviews: { DESIGN: [review('NEEDS_REWORK', { escalation: 'environment', findings: 'dotnet SDK missing' })] },
    answers: { 'environment:DESIGN': ['fixed'] },
  })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  assert.equal(host.dispatches.filter((d) => d.agent === P.DESIGN.specialist).length, 1)
  assert.equal(host.dispatches.filter((d) => d.agent === P.DESIGN.reviewer).length, 2)
  assert.match(host.questions[0].question, /dotnet SDK missing/)
})

test('run-pipeline: nobody to answer a checkpoint stops the run as awaiting-human with a stable key', async () => {
  const host = createFakeHost({ reviews: { DESIGN: [review('REJECTED', { findings: 'G13 decision drift pending' })] } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'awaiting-human')
  assert.equal(outcome.phase, 'DESIGN')
  assert.equal(outcome.checkpoint.key, 'rejected:DESIGN:1')
  assert.deepEqual(outcome.checkpoint.options, ['rework', 'stop'])
})

test('run-pipeline: ADR ratification — paused when unanswered, then resumed without redoing DESIGN', async () => {
  const host = createFakeHost({
    adrIndex: `${ADR_INDEX_HEADER}| 007 | Conformist Eligibility->Policy | Proposed | Conformist | conform | — | ${TODAY} |\n`,
  })
  const first = await runOnce(host)

  assert.equal(first.status, 'awaiting-human')
  assert.equal(first.checkpoint.key, 'adr-ratification:007')
  assert.equal(host.state(SLUG).adrRatification.checkpointStatus, 'awaiting_human')
  assert.equal(host.state(SLUG).currentPhase, 'DESIGN')
  const before = host.dispatches.length

  // The human answers; a new run (next session, or a resumed workflow) picks it up.
  host.decisions.set('adr-ratification:007', 'accept all') // e.g. recorded by the decide command
  const second = await runOnce(host)

  assert.equal(second.status, 'done')
  const resumed = host.dispatches.slice(before).map((d) => d.agent)
  assert.equal(resumed[0], P.DESIGN.specialist, 'the architect runs in ratify mode first')
  assert.match(host.dispatches[before].prompt, /Ratify mode — human verdicts\nApply ratify-mode to these verdicts, then commit:\n- ADR-007: accept/)
  assert.ok(!resumed.includes(P.RESEARCH.specialist), 'RESEARCH is not redone')
  assert.ok(!resumed.includes(P.DESIGN.reviewer), 'DESIGN is not re-reviewed')
  assert.deepEqual(host.state(SLUG).adrRatification, {
    checkpointStatus: 'resolved',
    pending: [],
    ratified: [{ adr: '007', verdict: 'Accepted', by: 'human' }],
  })
})

test('run-pipeline: a run resumes at the phase state.json records', async () => {
  const host = createFakeHost({ reviews: { DISTILL: [review('REJECTED')] } })
  const first = await runOnce(host)
  assert.equal(first.status, 'awaiting-human')
  const before = host.dispatches.length

  const dependencies = host.dependencies(SLUG)
  dependencies.humanInteraction.ask = async () => 'rework'
  const second = await createRunPipeline(dependencies).run({ slug: SLUG, story: STORY })

  assert.equal(second.status, 'done')
  const resumed = host.dispatches.slice(before).map((d) => d.agent)
  assert.equal(resumed[0], P.DISTILL.specialist)
  assert.ok(!resumed.includes(P.RESEARCH.specialist) && !resumed.includes(P.DESIGN.specialist))
  assert.equal(host.state(SLUG).retryCount.DISTILL, 1)
})

test('run-pipeline: a DONE pipeline dispatches nothing', async () => {
  const host = createFakeHost()
  await runOnce(host)
  const before = host.dispatches.length
  const again = await runOnce(host)
  assert.equal(again.status, 'done')
  assert.equal(host.dispatches.length, before)
})

test('run-pipeline: an answer given in the dialog is recorded, so a later run does not ask again', async () => {
  const host = createFakeHost({ reviews: { DISTILL: [review('REJECTED')] }, answers: { 'rejected:DISTILL': ['rework'] } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  assert.equal(host.decisions.get('rejected:DISTILL:1'), 'rework')
  assert.equal(host.questions.length, 1)
})

test('run-pipeline: a recorded decision is used without asking the human', async () => {
  const host = createFakeHost({
    reviews: { DESIGN: [review('REJECTED')] },
    decisions: { 'rejected:DESIGN:1': 'rework' },
  })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.questions, [])
})

test('run-pipeline: a second environment escalation in the same phase gets its own checkpoint key', async () => {
  const host = createFakeHost({ gates: ['inconclusive', 'inconclusive', 'pass'], answers: { 'environment:DELIVER': ['fixed', 'fixed'] } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  const keys = host.questions.map((q) => q.key)
  assert.equal(keys.length, 2)
  assert.notEqual(keys[0], keys[1])
})

test('run-pipeline: the run marks its pipeline active, so the settings hooks guard this run and not a previous one', async () => {
  const host = createFakeHost()
  await runOnce(host)
  assert.deepEqual(host.activations, [SLUG])
})

test('run-pipeline: a dispatch the state does not allow (G1) never leaves the code', async () => {
  const host = createFakeHost()
  const dependencies = host.dependencies(SLUG)
  // A state store that loses the architect's recorded artefacts: by the state, DESIGN's
  // specialist produced nothing, so its reviewer may not run.
  const write = dependencies.stateWriter.write
  dependencies.stateWriter = { write: (slug, state) => write(slug, { ...state, phaseArtifacts: { ...state.phaseArtifacts, DESIGN: [] } }) }
  const outcome = await createRunPipeline(dependencies).run({ slug: SLUG, story: STORY })

  assert.equal(outcome.status, 'blocked')
  assert.match(outcome.reason, /^dispatch order \(G1\): out-of-order dispatch of Skraft - Solution Architect Reviewer/)
  assert.ok(!host.agentsCalled().includes(P.DESIGN.reviewer))
})
