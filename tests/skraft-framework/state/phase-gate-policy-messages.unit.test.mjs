import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluatePhaseClosure,
  parseOutputEntry,
  requiredTrackedOutputs,
  toTrackingPath,
} from '../../../plugins/skraft-framework/src/domain/phase-gate-policy.mjs'

const T = '.copilot-tracking/skraft-plans/{projectSlug}/'

test('parseOutputEntry: surrounding whitespace is trimmed', () => {
  assert.deepEqual(parseOutputEntry('  a/b.md  '), { pattern: 'a/b.md', optional: false })
})

test('parseOutputEntry: several spaces may separate the path from its comment', () => {
  assert.deepEqual(parseOutputEntry('a/b.md   (optional)'), { pattern: 'a/b.md', optional: true })
})

test('parseOutputEntry: "optional" only counts at the start of the comment', () => {
  assert.deepEqual(parseOutputEntry('a/b.md (not optional)'), { pattern: 'a/b.md', optional: false })
  assert.deepEqual(parseOutputEntry('a/b.md (optionally kept)'), { pattern: 'a/b.md', optional: false })
})

test('requiredTrackedOutputs: the tracking prefix must lead the pattern', () => {
  const config = { agentArtifacts: { a: { outputs: [`docs/${T}x.md`, `${T}y.md`] } } }
  assert.deepEqual(requiredTrackedOutputs('a', config), ['y.md'])
})

test('requiredTrackedOutputs: a config without artefacts, or no config, declares nothing', () => {
  assert.deepEqual(requiredTrackedOutputs('a', {}), [])
  assert.deepEqual(requiredTrackedOutputs('a', undefined), [])
  assert.deepEqual(requiredTrackedOutputs('a', { agentArtifacts: { a: {} } }), [])
})

test('toTrackingPath: strips a repository prefix for any kebab-case slug', () => {
  assert.equal(toTrackingPath('.copilot-tracking/skraft-plans/ab/x.md'), 'x.md')
  assert.equal(toTrackingPath('.copilot-tracking/skraft-plans/shop-app-v2/x.md'), 'x.md')
  assert.equal(toTrackingPath('.copilot-tracking/skraft-plans/a-bc/x.md'), 'x.md')
  assert.equal(toTrackingPath('.copilot-tracking\\skraft-plans\\shop-app\\x.md'), 'x.md')
})

test('toTrackingPath: the repository prefix only counts at the start', () => {
  assert.equal(toTrackingPath('x/.copilot-tracking/skraft-plans/ab/y.md'), 'x/.copilot-tracking/skraft-plans/ab/y.md')
})

test('toTrackingPath: a non-string path is rejected without throwing', () => {
  assert.equal(toTrackingPath(42), null)
  assert.equal(toTrackingPath(undefined), null)
  assert.equal(toTrackingPath(null), null)
})

test('evaluatePhaseClosure: no config means no agents and no requirements', () => {
  assert.deepEqual(evaluatePhaseClosure({ phase: 'DESIGN', config: undefined, facts: {} }), [])
  assert.deepEqual(evaluatePhaseClosure({ phase: 'DESIGN', config: {}, facts: {} }), [])
})

test('evaluatePhaseClosure: nothing recorded leaves a required output missing', () => {
  const config = {
    phaseAgents: { DESIGN: { specialist: 'architect' } },
    agentArtifacts: { architect: { outputs: [`${T}{name}`] } },
  }
  assert.deepEqual(evaluatePhaseClosure({ phase: 'DESIGN', config, facts: {} }), [{
    code: 'ARTIFACT_MISSING',
    reason: 'DESIGN recorded no artefact matching {name}; record it with state.mjs record-artifact',
  }])
})

test('evaluatePhaseClosure: every violation carries its full reason', () => {
  const config = { phaseAgents: { DESIGN: { specialist: 'architect', reviewer: 'architect-reviewer' } } }
  assert.deepEqual(
    evaluatePhaseClosure({ phase: 'DESIGN', config, facts: { recorded: ['/abs.md'], missingOnDisk: ['gone.md'] } }),
    [
      { code: 'PATH_OUTSIDE_TRACKING', reason: '/abs.md is not relative to the tracking directory' },
      { code: 'ARTIFACT_NOT_FOUND', reason: 'gone.md is recorded for DESIGN but absent from the tracking directory' },
      { code: 'REVIEW_MISSING', reason: "DESIGN has no recorded review; record the reviewer's file with record-review-artifact, or pass --artifact to close-phase" },
    ],
  )
  assert.deepEqual(
    evaluatePhaseClosure({ phase: 'DESIGN', config, facts: { review: { path: 'reviews/r.md', verdict: undefined } } }),
    [{ code: 'REVIEW_NOT_FOUND', reason: 'reviews/r.md is absent from the tracking directory' }],
  )
  assert.deepEqual(
    evaluatePhaseClosure({ phase: 'DESIGN', config, facts: { review: { path: 'reviews/r.md', verdict: null } } }),
    [{ code: 'VERDICT_MISMATCH', reason: 'reviews/r.md records no verdict, not APPROVED' }],
  )
  assert.deepEqual(
    evaluatePhaseClosure({ phase: 'DESIGN', config, facts: { review: { path: 'reviews/r.md', verdict: 'REJECTED' } } }),
    [{ code: 'VERDICT_MISMATCH', reason: 'reviews/r.md records REJECTED, not APPROVED' }],
  )
})

test('evaluatePhaseClosure: DELIVER commit reasons', () => {
  assert.deepEqual(evaluatePhaseClosure({ phase: 'DELIVER', config: {}, facts: {} }), [{
    code: 'BASE_UNRECORDED',
    reason: 'DELIVER has no base commit; run state.mjs mark-phase-started --phase DELIVER before dispatching the engineer',
  }])
  assert.deepEqual(evaluatePhaseClosure({ phase: 'DELIVER', config: {}, facts: { baseSha: 'abc', headSha: 'abc' } }), [{
    code: 'NO_COMMIT',
    reason: 'DELIVER produced no commit since its base abc',
  }])
})
