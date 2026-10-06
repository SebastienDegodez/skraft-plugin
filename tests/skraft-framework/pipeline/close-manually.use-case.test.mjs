// Use-case tests of CloseManually (src/application/pipeline/close-manually.mjs): a reviewed
// phase closed by human-validated reworks, then the pipeline resumed past it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRunPipeline } from '../../../plugins/skraft-framework/src/application/pipeline/run-pipeline.mjs'
import { createCloseManually } from '../../../plugins/skraft-framework/src/application/pipeline/close-manually.mjs'
import { readReviewOutcome } from '../../../plugins/skraft-framework/src/domain/pipeline/review-outcome.mjs'
import { createFakeHost, CONFIG, TODAY } from './fake-host.mjs'

const SLUG = 'checkout'
const P = CONFIG.phaseAgents
const runOnce = (host) => createRunPipeline(host.dependencies(SLUG)).run({ slug: SLUG, story: { issue: 42, title: 'Pay by card' } })
const closer = (host) => createCloseManually(host.dependencies(SLUG))

test('close-manually: a rejected DESIGN closed by the human resumes the pipeline at DISTILL', async () => {
  const host = createFakeHost({ verdicts: { DESIGN: ['REJECTED'] } })
  assert.equal((await runOnce(host)).status, 'awaiting-human')

  const closed = await closer(host).close({ slug: SLUG, findings: 3 })
  assert.deepEqual(closed, { ok: true, value: { phase: 'DESIGN', next: 'DISTILL', review: `reviews/${TODAY}/manual-close.md` } })
  const state = host.state(SLUG)
  assert.equal(state.reworkCount.DESIGN, 1)
  assert.equal(state.findingsResolved.DESIGN, 3)
  assert.equal(state.verdicts.DESIGN, 'APPROVED')
  assert.equal(state.reviewArtifacts.DESIGN.at(-1), `reviews/${TODAY}/manual-close.md`)
  assert.equal(readReviewOutcome(host.tracking(SLUG, `reviews/${TODAY}/manual-close.md`)).verdict, 'APPROVED')

  const before = host.dispatches.length
  assert.equal((await runOnce(host)).status, 'done')
  assert.equal(host.dispatches[before].agent, P.DISTILL.specialist)
})

test('close-manually: DELIVER refuses while a recent commit breaks type(scope): subject, and counts no rework', async () => {
  const host = createFakeHost({
    verdicts: { DELIVER: ['REJECTED'] },
    commits: [{ sha: 'abcdef0123', subject: 'wip' }, { sha: '0123abcdef', subject: 'feat(checkout): pay' }],
  })
  await runOnce(host)
  const refused = await closer(host).close({ slug: SLUG, phase: 'DELIVER', findings: 1 })

  assert.equal(refused.ok, false)
  assert.equal(refused.error.code, 'NON_CONVENTIONAL_COMMITS')
  assert.match(refused.error.reason, /abcdef0 "wip"/)
  assert.equal(host.state(SLUG).reworkCount.DELIVER ?? 0, 0)
  assert.equal(host.state(SLUG).currentPhase, 'DELIVER')
})

test('close-manually: DELIVER with conventional commits closes the pipeline', async () => {
  const host = createFakeHost({ verdicts: { DELIVER: ['REJECTED'] }, commits: [{ sha: '0123abcdef', subject: 'feat(checkout): pay' }] })
  await runOnce(host)
  const closed = await closer(host).close({ slug: SLUG })

  assert.equal(closed.ok, true)
  assert.equal(closed.value.next, 'DONE')
  assert.equal(host.state(SLUG).findingsResolved.DELIVER, 0)
})

test('close-manually: refusals — slug, findings, a reviewer-less or closed phase, another phase than the open one', async () => {
  const host = createFakeHost({ verdicts: { DESIGN: ['REJECTED'] } })
  const close = (args) => closer(host).close(args).then((r) => r.error?.code ?? 'ok')

  assert.equal(await close({ slug: 'Not A Slug' }), 'INVALID_SLUG')
  assert.equal(await close({ slug: SLUG }), 'ENOENT')
  await createRunPipeline(host.dependencies(SLUG)).run({ slug: SLUG, maxPhases: 0 })
  assert.equal(await close({ slug: SLUG }), 'NO_REVIEWER', 'RESEARCH closes itself')
  await runOnce(host)
  assert.equal(await close({ slug: SLUG, findings: -1 }), 'INVALID_ARGUMENT')
  assert.equal(await close({ slug: SLUG, findings: 1.5 }), 'INVALID_ARGUMENT')
  assert.equal(await close({ slug: SLUG, phase: 'DELIVER' }), 'PHASE_MISMATCH')
  assert.equal(await close({ slug: SLUG, phase: 'DESIGN' }), 'ok')
  await runOnce(host)
  assert.equal(await close({ slug: SLUG }), 'PIPELINE_DONE')
})
