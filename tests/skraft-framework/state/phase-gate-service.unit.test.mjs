import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPhaseGate } from '../../../plugins/skraft-framework/src/application/phase-gate-service.mjs'

// The gate's IO seam, in memory: which tracking files exist, what they hold, and HEAD.
const T = '.copilot-tracking/skraft-plans/{projectSlug}/'
const CONFIG = {
  phaseAgents: {
    RESEARCH: { specialist: 'researcher', reviewer: null },
    DESIGN: { specialist: 'architect', reviewer: 'architect-reviewer' },
    DELIVER: { specialist: 'engineer', reviewer: 'engineer-reviewer' },
  },
  agentArtifacts: {
    researcher: { outputs: [`${T}research/{date}/{slug}-research.md`] },
    architect: { outputs: [`${T}details/{date}/contracts-{story}.md`] },
    engineer: { outputs: [`${T}changes/{date}/change-log.md`] },
  },
}

const gateOver = (files, { head = 'b' } = {}) => {
  const reads = []
  const gate = createPhaseGate({
    config: CONFIG,
    trackingFiles: {
      exists: async (slug, path) => Object.hasOwn(files, `${slug}/${path}`),
      read: async (slug, path) => {
        reads.push(`${slug}/${path}`)
        if (!Object.hasOwn(files, `${slug}/${path}`)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        return files[`${slug}/${path}`]
      },
    },
    git: { headSha: async () => head },
  })
  return { gate, reads }
}
const codes = (violations) => violations.map((v) => v.code)

test('a reviewer-less phase is judged on its recorded artefacts only, never a review', async () => {
  const { gate, reads } = gateOver({ 'p/research/d/x-research.md': '#' })
  const state = { phaseArtifacts: { RESEARCH: ['research/d/x-research.md'] }, reviewArtifacts: { RESEARCH: ['reviews/d/r.md'] } }
  assert.deepEqual(await gate.check('p', state, 'RESEARCH'), [])
  assert.deepEqual(reads, [])
})

test('recorded artefacts missing from the tracking directory are reported, invalid ones never probed', async () => {
  const { gate } = gateOver({})
  const state = { phaseArtifacts: { RESEARCH: ['research/d/x-research.md', '../escape.md'] } }
  assert.deepEqual(codes(await gate.check('p', state, 'RESEARCH')), ['PATH_OUTSIDE_TRACKING', 'ARTIFACT_NOT_FOUND'])
})

test('the latest recorded review decides, not an earlier one', async () => {
  const { gate, reads } = gateOver({
    'p/details/d/contracts-x.md': '#',
    'p/reviews/d/design-review-1.md': 'verdict: "NEEDS_REWORK"',
    'p/reviews/d/design-review-2.md': 'verdict: "APPROVED"',
  })
  const state = {
    phaseArtifacts: { DESIGN: ['details/d/contracts-x.md'] },
    reviewArtifacts: { DESIGN: ['reviews/d/design-review-1.md', 'reviews/d/design-review-2.md'] },
  }
  assert.deepEqual(await gate.check('p', state, 'DESIGN'), [])
  assert.deepEqual(reads, ['p/reviews/d/design-review-2.md'])
})

test('the artefact close-phase is given decides over the recorded ones, in either path form', async () => {
  const files = {
    'p/details/d/contracts-x.md': '#',
    'p/reviews/d/design-review-1.md': 'verdict: "APPROVED"',
    'p/reviews/d/manual-close.md': 'verdict: "NEEDS_REWORK"',
  }
  const state = { phaseArtifacts: { DESIGN: ['details/d/contracts-x.md'] }, reviewArtifacts: { DESIGN: ['reviews/d/design-review-1.md'] } }
  for (const closingArtifact of ['reviews/d/manual-close.md', '.copilot-tracking/skraft-plans/p/reviews/d/manual-close.md']) {
    const { gate } = gateOver(files)
    const [violation] = await gate.check('p', state, 'DESIGN', { closingArtifact })
    assert.equal(violation.code, 'VERDICT_MISMATCH', closingArtifact)
    assert.equal(violation.reason, 'reviews/d/manual-close.md records NEEDS_REWORK, not APPROVED')
  }
})

test('a review that is recorded but absent, or never recorded, blocks a reviewed phase', async () => {
  const state = { phaseArtifacts: { DESIGN: ['details/d/contracts-x.md'] } }
  const { gate } = gateOver({ 'p/details/d/contracts-x.md': '#' })
  assert.deepEqual(codes(await gate.check('p', state, 'DESIGN')), ['REVIEW_MISSING'])
  assert.deepEqual(codes(await gate.check('p', { ...state, reviewArtifacts: { DESIGN: ['reviews/d/gone.md'] } }, 'DESIGN')), ['REVIEW_NOT_FOUND'])
  assert.deepEqual(codes(await gate.check('p', state, 'DESIGN', { closingArtifact: '../escape.md' })), ['REVIEW_MISSING'])
})

test('DELIVER compares HEAD with the base its phase history recorded; other phases never ask git', async () => {
  const files = { 'p/changes/d/change-log.md': '#', 'p/reviews/d/deliver-review-1.md': 'verdict: "APPROVED"' }
  const state = (baseSha) => ({
    phaseArtifacts: { DELIVER: ['changes/d/change-log.md'] },
    reviewArtifacts: { DELIVER: ['reviews/d/deliver-review-1.md'] },
    phaseHistory: { DELIVER: { baseSha } },
  })
  assert.deepEqual(await gateOver(files, { head: 'b' }).gate.check('p', state('a'), 'DELIVER'), [])
  assert.deepEqual(codes(await gateOver(files, { head: 'a' }).gate.check('p', state('a'), 'DELIVER')), ['NO_COMMIT'])
  assert.deepEqual(codes(await gateOver(files, { head: 'b' }).gate.check('p', { ...state('a'), phaseHistory: {} }, 'DELIVER')), ['BASE_UNRECORDED'])

  let asked = false
  const gate = createPhaseGate({
    config: CONFIG,
    trackingFiles: { exists: async () => true, read: async () => 'verdict: "APPROVED"' },
    git: { headSha: async () => { asked = true; return 'x' } },
  })
  await gate.check('p', { phaseArtifacts: { RESEARCH: ['research/d/x-research.md'] } }, 'RESEARCH')
  assert.equal(asked, false)
})

test('a state without artefact maps is judged as recording nothing', async () => {
  const { gate } = gateOver({})
  assert.deepEqual(codes(await gate.check('p', {}, 'RESEARCH')), ['ARTIFACT_MISSING'])
})
