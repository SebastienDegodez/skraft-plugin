import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stepOnEntry,
  stepAfterReview,
  stepAfterMissingOutputs,
  stepAfterQualityGates,
  stepAfterEnvironmentFixed,
  stepAfterRejection,
  reworkStep,
  checkpointKeys,
  ADVANCE,
  REVIEWER,
} from '../../../plugins/skraft-framework/src/domain/pipeline/step-policy.mjs'
import {
  expectedTrackedOutputs,
  matchOutputs,
  latestEvidenceLog,
  structuralScanPath,
  hasStructuralScan,
} from '../../../plugins/skraft-framework/src/domain/pipeline/expected-outputs.mjs'
import { CONFIG, concretePath } from './fake-host.mjs'

// ── step-policy ───────────────────────────────────────────────────────────────

test('step-policy: a phase starts with its specialist, or advances when already approved', () => {
  assert.deepEqual(stepOnEntry({ verdict: undefined }), { kind: 'specialist', addenda: [] })
  assert.equal(stepOnEntry({ verdict: 'APPROVED' }), ADVANCE)
})

test('step-policy: a phase resumed after changes requested follows its latest review', () => {
  const base = { verdict: 'CHANGES_REQUESTED', attempt: 2, maxAttempts: 3 }
  assert.deepEqual(stepOnEntry({ ...base, lastReview: { verdict: 'REJECTED', findings: 'G13' } }), { kind: 'rejected', findings: 'G13' })
  assert.deepEqual(stepOnEntry({ ...base, lastReview: { verdict: 'NEEDS_REWORK', escalation: 'environment', findings: 'no SDK' } }), { kind: 'environment', detail: 'no SDK', source: 'review' })
  const rework = stepOnEntry({ ...base, lastReview: { verdict: 'NEEDS_REWORK', escalation: null, findings: 'G4 missing' } })
  assert.equal(rework.kind, 'specialist')
  assert.equal(rework.addenda[0].title, 'Reviewer findings (attempt 2 of 3)')
  assert.match(rework.addenda[0].body, /G4 missing/)
  assert.deepEqual(stepOnEntry({ ...base, lastReview: null }), { kind: 'specialist', addenda: [] })
})

test('step-policy: a review verdict decides the state verdict and the next step', () => {
  assert.deepEqual(stepAfterReview({ verdict: 'APPROVED' }), { stateVerdict: 'APPROVED', step: ADVANCE })
  assert.deepEqual(stepAfterReview({ verdict: 'NEEDS_REWORK', escalation: null, findings: 'f' }), { stateVerdict: 'CHANGES_REQUESTED', step: { kind: 'retry', findings: 'f' } })
  assert.deepEqual(stepAfterReview({ verdict: 'NEEDS_REWORK', escalation: 'environment', findings: 'f' }).step, { kind: 'environment', detail: 'f', source: 'review' })
  assert.deepEqual(stepAfterReview({ verdict: 'REJECTED', findings: 'f' }), { stateVerdict: 'CHANGES_REQUESTED', step: { kind: 'rejected', findings: 'f' } })
  assert.deepEqual(stepAfterReview({ verdict: null }), { stateVerdict: null, step: null })
})

test('step-policy: quality gates — pass goes on, fail is a retry, anything else asks about the environment', () => {
  assert.equal(stepAfterQualityGates({ outcome: 'pass', findings: '' }), null)
  assert.equal(stepAfterQualityGates({ outcome: 'fail', findings: 'G6' }).kind, 'retry')
  assert.deepEqual(stepAfterQualityGates({ outcome: 'inconclusive', findings: 'G1' }), { kind: 'environment', detail: 'G1', source: 'qg-verify' })
  assert.equal(stepAfterQualityGates({ outcome: 'error', findings: 'x' }).kind, 'environment')
})

test('step-policy: missing outputs, environment fixed, rejection answer, rework', () => {
  assert.deepEqual(stepAfterMissingOutputs(['a.md', 'b.md']), { kind: 'retry', findings: 'Artefact missing: a.md, b.md. Write every required output at its dated path.' })
  assert.equal(stepAfterEnvironmentFixed('DESIGN'), REVIEWER)
  assert.equal(stepAfterEnvironmentFixed('DELIVER').addenda[0].title, 'Environment re-gate')
  assert.deepEqual(stepAfterRejection(' Rework ', 'f'), { kind: 'retry', findings: 'f' })
  assert.equal(stepAfterRejection('stop', 'f'), null)
  assert.deepEqual(reworkStep({ findings: '', attempt: 2, maxAttempts: 3 }), { kind: 'specialist', addenda: [] })
})

test('step-policy: checkpoint keys are stable and distinct per occurrence', () => {
  assert.equal(checkpointKeys.rejected('DESIGN', 2), 'rejected:DESIGN:2')
  assert.equal(checkpointKeys.adrRatification([{ adr: '007' }, { adr: '008' }]), 'adr-ratification:007,008')
  const env = (occurrence) => checkpointKeys.environment('DELIVER', { source: 'qg-verify', recordedReviews: 0, retries: 1, occurrence })
  assert.equal(env(1), 'environment:DELIVER:qg-verify:r0:t1:n1')
  assert.notEqual(env(1), env(2))
})

// ── expected-outputs ──────────────────────────────────────────────────────────

test('expected-outputs: required and optional tracked outputs of an agent, repository outputs left out', () => {
  const architect = expectedTrackedOutputs('Skraft - Solution Architect', CONFIG)
  assert.ok(architect.some((o) => o.pattern === 'details/{date}/contracts-{story}.md' && !o.optional))
  assert.ok(architect.some((o) => o.optional))
  assert.ok(architect.every((o) => !o.pattern.startsWith('docs/')))
  assert.deepEqual(expectedTrackedOutputs('Nobody', CONFIG), [])
})

test('expected-outputs: found files and missing required patterns', () => {
  const expectations = [
    { pattern: 'research/{date}/{slug}-research.md', optional: false },
    { pattern: 'details/{date}/notes.md', optional: true },
    { pattern: 'details/{date}/contracts-{story}.md', optional: false },
  ]
  const files = ['research/2026-10-06/checkout-research.md', 'unrelated.txt']
  assert.deepEqual(matchOutputs(files, expectations), {
    found: ['research/2026-10-06/checkout-research.md'],
    missing: ['details/{date}/contracts-{story}.md'],
  })
})

test('expected-outputs: latest evidence log, structural scan path and presence', () => {
  assert.equal(latestEvidenceLog(['changes/d/change-log.md', 'evidence/2026-10-05/s1/qg-s1.json', 'evidence/2026-10-06/s1/qg-s1.json']), 'evidence/2026-10-06/s1/qg-s1.json')
  assert.equal(latestEvidenceLog(['changes/d/change-log.md']), null)
  assert.equal(structuralScanPath('2026-10-06'), 'details/2026-10-06/structural-scan.json')
  assert.equal(hasStructuralScan({ phaseArtifacts: { RESEARCH: ['details/d/structural-scan.json'] } }), true)
  assert.equal(hasStructuralScan({ phaseArtifacts: {} }), false)
})

// ── Recovery, progress inference, manual closure ───────────────────────────────

test('recoveryStepOf: the step each diagnosis calls for', async () => {
  const { recoveryStepOf, buildRecoveryGuidance } = await import('../../../plugins/skraft-framework/src/domain/recovery-policy.mjs')
  assert.equal(recoveryStepOf({ code: 'HEALTHY' }), 'none')
  assert.equal(recoveryStepOf({ code: 'MISSING_STATE' }), 'init')
  assert.equal(recoveryStepOf({ code: 'MISSING_STATE', backupCount: 1 }), 'rollback')
  assert.equal(recoveryStepOf({ code: 'CORRUPTED_STATE' }), 'reset')
  assert.equal(recoveryStepOf({ code: 'INVALID_STATE', backupCount: 2 }), 'rollback')
  assert.equal(recoveryStepOf({ code: 'STALE' }), 'resolve-stale')
  assert.equal(recoveryStepOf({ code: 'IO_ERROR' }), 'halt')
  assert.equal(buildRecoveryGuidance({ code: 'CORRUPTED_STATE', slug: 's', backupCount: 1 }).step, 'rollback')
})

test('reviewFilesOf: a phase\'s reviews, newest date then highest number first', async () => {
  const { reviewFilesOf } = await import('../../../plugins/skraft-framework/src/domain/pipeline/progress-inference-policy.mjs')
  const files = [
    'reviews/2026-10-01/design-review-2.md', 'reviews/2026-10-02/design-review-1.md',
    'reviews/2026-10-01/design-review-10.md', 'reviews/2026-10-02/distill-review-1.md', 'reviews/2026-10-02/manual-close.md',
  ]
  assert.deepEqual(reviewFilesOf('DESIGN', files), [
    'reviews/2026-10-02/design-review-1.md', 'reviews/2026-10-01/design-review-10.md', 'reviews/2026-10-01/design-review-2.md',
  ])
})

test('inferCompletedPhases: phases in order while outputs and, when reviewed, an APPROVED review are there', async () => {
  const { inferCompletedPhases } = await import('../../../plugins/skraft-framework/src/domain/pipeline/progress-inference-policy.mjs')
  const { requiredTrackedOutputs } = await import('../../../plugins/skraft-framework/src/domain/phase-gate-policy.mjs')
  const outputs = (phase) => requiredTrackedOutputs(CONFIG.phaseAgents[phase].specialist, CONFIG).map((p) => concretePath(p, 'checkout'))
  const phaseOrder = ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'DONE']
  const files = [...outputs('RESEARCH'), ...outputs('DESIGN'), ...outputs('DISTILL')]
  const approved = { DESIGN: 'reviews/d/design-review-1.md' }
  const completed = inferCompletedPhases({ phaseOrder, config: CONFIG, files, approvedReview: (phase) => approved[phase] ?? null })

  assert.deepEqual(completed.map(({ phase, review }) => [phase, review]), [['RESEARCH', null], ['DESIGN', 'reviews/d/design-review-1.md']])
  assert.deepEqual(inferCompletedPhases({ phaseOrder, config: CONFIG, files: [], approvedReview: () => 'x' }), [])
})

test('manual closure: the review it renders, its path, and what it refuses', async () => {
  const { manualClosureReview, manualClosePath, manualClosureRefusal } = await import('../../../plugins/skraft-framework/src/domain/pipeline/manual-closure-policy.mjs')
  const { validate } = await import('../../../plugins/skraft-framework/src/domain/artifact-registry.mjs')
  assert.equal(validate('review-verdict', manualClosureReview()).ok, true)
  const weights = Object.values(manualClosureReview().synthesis.questions).reduce((sum, q) => sum + q.weight, 0)
  assert.equal(Math.round(weights * 100), 100)
  assert.equal(manualClosePath('2026-10-06'), 'reviews/2026-10-06/manual-close.md')
  assert.equal(manualClosureRefusal({ currentPhase: 'DESIGN', reviewer: 'R' }), null)
  assert.equal(manualClosureRefusal({ phase: 'DESIGN', currentPhase: 'DESIGN', reviewer: 'R' }), null)
  assert.equal(manualClosureRefusal({ currentPhase: 'DONE' }).code, 'PIPELINE_DONE')
  assert.equal(manualClosureRefusal({ currentPhase: 'RESEARCH' }).code, 'NO_REVIEWER')
  assert.equal(manualClosureRefusal({ phase: 'DISTILL', currentPhase: 'DESIGN', reviewer: 'R' }).code, 'PHASE_MISMATCH')
})
