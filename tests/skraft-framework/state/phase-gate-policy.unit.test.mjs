import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluatePhaseClosure,
  isTrackingRelativePath,
  parseOutputEntry,
  requiredTrackedOutputs,
  toStateVerdict,
} from '../../../plugins/skraft-framework/src/domain/phase-gate-policy.mjs'

const T = '.copilot-tracking/skraft-plans/{projectSlug}/'
const CONFIG = {
  phaseAgents: {
    RESEARCH: { specialist: 'researcher', reviewer: null },
    DESIGN: { specialist: 'architect', reviewer: 'architect-reviewer' },
    DELIVER: { specialist: 'engineer', reviewer: 'engineer-reviewer' },
  },
  agentArtifacts: {
    researcher: { outputs: [`${T}research/{date}/{slug}-research.md`] },
    architect: {
      outputs: [
        `${T}details/{date}/contracts-{story}.md`,
        'docs/adr/adr-{NNN}-{slug}.md',
        `${T}details/{date}/supersession-plan-{story}.md (optional — only when a decision is superseded)`,
      ],
    },
    engineer: {
      outputs: [
        'Source code commits (conventional commits)',
        `${T}changes/{date}/change-log.md`,
        `${T}evidence/{date}/qg-{story}.json (quality-gates evidence log)`,
      ],
    },
  },
}

// ─── descriptor outputs ────────────────────────────────────────────────────────

test('parseOutputEntry: a path, a described path, an optional path, and prose', () => {
  assert.deepEqual(parseOutputEntry('a/b.md'), { pattern: 'a/b.md', optional: false })
  assert.deepEqual(parseOutputEntry('a/qg.json (quality-gates evidence log)'), { pattern: 'a/qg.json', optional: false })
  assert.deepEqual(parseOutputEntry('a/plan.md (optional — only when superseding)'), { pattern: 'a/plan.md', optional: true })
  assert.deepEqual(parseOutputEntry('a/plan.md (Optional)'), { pattern: 'a/plan.md', optional: true })
  assert.equal(parseOutputEntry('Source code commits (conventional commits)'), null)
  assert.equal(parseOutputEntry(undefined), null)
})

test('requiredTrackedOutputs: tracking-relative, required, inside the tracking directory only', () => {
  assert.deepEqual(requiredTrackedOutputs('architect', CONFIG), ['details/{date}/contracts-{story}.md'])
  assert.deepEqual(requiredTrackedOutputs('engineer', CONFIG), ['changes/{date}/change-log.md', 'evidence/{date}/qg-{story}.json'])
  assert.deepEqual(requiredTrackedOutputs('nobody', CONFIG), [])
})

test('isTrackingRelativePath: refuses absolute paths and parent traversal', () => {
  assert.equal(isTrackingRelativePath('reviews/2026-09-23/design-review-1.md'), true)
  for (const path of ['/etc/passwd', 'C:\\x.md', '../other/state.json', 'reviews/../../x', '', null]) {
    assert.equal(isTrackingRelativePath(path), false, String(path))
  }
})

test('toStateVerdict: one mapping between the review vocabulary and the state vocabulary', () => {
  assert.equal(toStateVerdict('APPROVED'), 'APPROVED')
  assert.equal(toStateVerdict('NEEDS_REWORK'), 'CHANGES_REQUESTED')
  assert.equal(toStateVerdict('REJECTED'), 'CHANGES_REQUESTED')
  assert.equal(toStateVerdict('CHANGES_REQUESTED'), null)
  assert.equal(toStateVerdict(null), null)
})

// ─── evaluatePhaseClosure ───────────────────────────────────────────────────────

const codes = (violations) => violations.map((v) => v.code)
const approvedReview = { path: 'reviews/2026-09-23/design-review-2.md', verdict: 'APPROVED' }

test('a reviewer-less phase closes on its recorded, present artefact', () => {
  const facts = { recorded: ['research/2026-09-23/x-research.md'], missingOnDisk: [] }
  assert.deepEqual(evaluatePhaseClosure({ phase: 'RESEARCH', config: CONFIG, facts }), [])
})

test('a required artefact never recorded blocks and names its pattern', () => {
  const [v] = evaluatePhaseClosure({ phase: 'RESEARCH', config: CONFIG, facts: { recorded: [] } })
  assert.equal(v.code, 'ARTIFACT_MISSING')
  assert.equal(v.reason, 'RESEARCH recorded no artefact matching research/{date}/{slug}-research.md; record it with state.mjs record-artifact')
})

test('an optional or repository output is never required', () => {
  const facts = { recorded: ['details/2026-09-23/contracts-loyalty.md'], review: approvedReview }
  assert.deepEqual(evaluatePhaseClosure({ phase: 'DESIGN', config: CONFIG, facts }), [])
})

test('a recorded artefact absent from disk, or outside the tracking directory, blocks', () => {
  const facts = { recorded: ['research/2026-09-23/x-research.md', '../x.md'], missingOnDisk: ['research/2026-09-23/x-research.md'] }
  assert.deepEqual(codes(evaluatePhaseClosure({ phase: 'RESEARCH', config: CONFIG, facts })), ['PATH_OUTSIDE_TRACKING', 'ARTIFACT_NOT_FOUND'])
})

test('a reviewed phase needs its deciding review on disk and approved', () => {
  const base = { recorded: ['details/2026-09-23/contracts-loyalty.md'] }
  const cases = [
    [null, 'REVIEW_MISSING'],
    [{ path: 'reviews/x.md', verdict: undefined }, 'REVIEW_NOT_FOUND'],
    [{ path: 'reviews/x.md', verdict: null }, 'VERDICT_MISMATCH'],
    [{ path: 'reviews/x.md', verdict: 'NEEDS_REWORK' }, 'VERDICT_MISMATCH'],
    [{ path: 'reviews/x.md', verdict: 'REJECTED' }, 'VERDICT_MISMATCH'],
  ]
  for (const [review, code] of cases) {
    assert.deepEqual(codes(evaluatePhaseClosure({ phase: 'DESIGN', config: CONFIG, facts: { ...base, review } })), [code], code)
  }
  const [mismatch] = evaluatePhaseClosure({ phase: 'DESIGN', config: CONFIG, facts: { ...base, review: { path: 'reviews/x.md', verdict: 'NEEDS_REWORK' } } })
  assert.equal(mismatch.reason, 'reviews/x.md records NEEDS_REWORK, not APPROVED')
})

test('DELIVER closes only on a commit made since its recorded base', () => {
  const base = {
    recorded: ['changes/2026-09-23/change-log.md', 'evidence/2026-09-23/qg-loyalty.json'],
    review: { path: 'reviews/2026-09-23/deliver-review-1.md', verdict: 'APPROVED' },
  }
  assert.deepEqual(codes(evaluatePhaseClosure({ phase: 'DELIVER', config: CONFIG, facts: { ...base, headSha: 'b' } })), ['BASE_UNRECORDED'])
  assert.deepEqual(codes(evaluatePhaseClosure({ phase: 'DELIVER', config: CONFIG, facts: { ...base, baseSha: 'a', headSha: 'a' } })), ['NO_COMMIT'])
  assert.deepEqual(codes(evaluatePhaseClosure({ phase: 'DELIVER', config: CONFIG, facts: { ...base, baseSha: 'a', headSha: null } })), ['NO_COMMIT'])
  assert.deepEqual(evaluatePhaseClosure({ phase: 'DELIVER', config: CONFIG, facts: { ...base, baseSha: 'a', headSha: 'b' } }), [])
})
