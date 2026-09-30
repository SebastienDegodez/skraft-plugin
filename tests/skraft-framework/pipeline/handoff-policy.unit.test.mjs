import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHandoff,
  evaluateHandoff,
  renderHandoff,
  HANDOFF_MODES,
} from '../../../plugins/skraft-framework/src/domain/handoff-policy.mjs'

const T = '.copilot-tracking/skraft-plans/{projectSlug}/'

const CONFIG = {
  phaseOrder: ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'],
  phaseAgents: {
    RESEARCH: { specialist: 'researcher', reviewer: null },
    DESIGN: { specialist: 'architect', reviewer: 'architect-reviewer' },
    DISTILL: { specialist: 'designer', reviewer: 'designer-reviewer' },
    DELIVER: { specialist: 'engineer', reviewer: 'engineer-reviewer' },
  },
  agentArtifacts: {
    architect: {
      inputs: [`${T}plans/{date}/stories-{milestone}.md`, `${T}research/{date}/{slug}-research.md`],
      outputs: [],
    },
    engineer: {
      inputs: [
        `${T}features/{bounded-context}-{feature}.feature`,
        `${T}details/{date}/test-plan-{story}.md`,
        'tests/**/{Feature}AcceptanceTests.cs',
      ],
      outputs: [],
    },
    'engineer-reviewer': {
      inputs: ['Source code commits produced by the engineer', `${T}details/{date}/test-plan-{story}.md`],
      outputs: [],
    },
  },
  agentContext: {
    engineer: [`${T}details/{date}/contracts-{story}.md`, 'docs/adr/decisions-index.md'],
  },
}

const state = (overrides = {}) => ({
  currentPhase: 'DELIVER',
  phaseArtifacts: {
    RESEARCH: ['research/2026-09-30/checkout-research.md'],
    DESIGN: ['details/2026-09-30/contracts-42.md'],
    DISTILL: ['features/billing-checkout.feature', 'details/2026-09-30/test-plan-42.md'],
  },
  verdicts: {},
  reviewArtifacts: {},
  retryCount: {},
  userPreferences: { maxRetriesPerPhase: 2 },
  ...overrides,
})

test('buildHandoff: resolves each tracked input from the artefacts recorded by earlier phases', () => {
  const handoff = buildHandoff({ agent: 'engineer', state: state(), config: CONFIG }).value
  assert.equal(handoff.phase, 'DELIVER')
  assert.equal(handoff.role, 'specialist')
  assert.equal(handoff.mode, HANDOFF_MODES.FIRST_PASS)
  assert.deepEqual(handoff.required.map(({ kind, paths, resolved }) => ({ kind, paths, resolved })), [
    { kind: 'tracked', paths: ['features/billing-checkout.feature'], resolved: true },
    { kind: 'tracked', paths: ['details/2026-09-30/test-plan-42.md'], resolved: true },
    { kind: 'repository', paths: [], resolved: false },
  ])
  assert.deepEqual(handoff.context.map(({ paths }) => paths), [['details/2026-09-30/contracts-42.md'], []])
})

test('buildHandoff: an input no phase recorded stays unresolved', () => {
  const handoff = buildHandoff({ agent: 'architect', state: state({ currentPhase: 'DESIGN' }), config: CONFIG }).value
  assert.equal(handoff.required[0].resolved, false)
  assert.deepEqual(handoff.required[1].paths, ['research/2026-09-30/checkout-research.md'])
})

test('buildHandoff: a specialist after CHANGES_REQUESTED is in rework mode with the review and its previous output', () => {
  const handoff = buildHandoff({
    agent: 'engineer',
    state: state({
      phaseArtifacts: { ...state().phaseArtifacts, DELIVER: ['changes/2026-09-30/change-log.md'] },
      verdicts: { DELIVER: 'CHANGES_REQUESTED' },
      reviewArtifacts: { DELIVER: ['reviews/2026-09-30/deliver-review-1.md'] },
      retryCount: { DELIVER: 1 },
    }),
    config: CONFIG,
  }).value
  assert.equal(handoff.mode, HANDOFF_MODES.REWORK)
  assert.equal(handoff.attempt, 2)
  assert.equal(handoff.maxAttempts, 3)
  assert.equal(handoff.previousReview, 'reviews/2026-09-30/deliver-review-1.md')
  assert.deepEqual(handoff.previousOutputs, ['changes/2026-09-30/change-log.md'])
  assert.equal(handoff.required[1].resolved, true, 'a retry keeps the test plan')
})

test('buildHandoff: a reviewer after CHANGES_REQUESTED re-reviews, with the artefacts under review', () => {
  const handoff = buildHandoff({
    agent: 'engineer-reviewer',
    state: state({
      phaseArtifacts: { ...state().phaseArtifacts, DELIVER: ['changes/2026-09-30/change-log.md'] },
      verdicts: { DELIVER: 'CHANGES_REQUESTED' },
      reviewArtifacts: { DELIVER: ['reviews/2026-09-30/deliver-review-1.md'] },
    }),
    config: CONFIG,
  }).value
  assert.equal(handoff.mode, HANDOFF_MODES.RE_REVIEW)
  assert.deepEqual(handoff.underReview, ['changes/2026-09-30/change-log.md'])
  assert.deepEqual(handoff.previousOutputs, [])
  assert.equal(handoff.required[0].kind, 'note')
})

test('buildHandoff: refuses an agent of no phase, or of a phase that is not open', () => {
  assert.equal(buildHandoff({ agent: 'cold-reader-lens', state: state(), config: CONFIG }).error.code, 'UNGOVERNED')
  assert.equal(buildHandoff({ agent: 'architect', state: state(), config: CONFIG }).error.code, 'WRONG_PHASE')
})

test('evaluateHandoff: a prompt naming every recorded required input passes', () => {
  const prompt = [
    'Implement story 42.',
    '- .copilot-tracking/skraft-plans/checkout/features/billing-checkout.feature',
    '- .copilot-tracking\\skraft-plans\\checkout\\details\\2026-09-30\\test-plan-42.md',
  ].join('\n')
  assert.equal(evaluateHandoff({ agent: 'engineer', state: state(), config: CONFIG, prompt }).ok, true)
})

test('evaluateHandoff: a prompt without the test plan is refused and names it', () => {
  const prompt = 'Implement story 42 from features/billing-checkout.feature'
  const result = evaluateHandoff({ agent: 'engineer', state: state(), config: CONFIG, prompt })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'HANDOFF_INCOMPLETE')
  assert.deepEqual(result.error.missing, [{
    input: `${T}details/{date}/test-plan-{story}.md`,
    expected: ['details/2026-09-30/test-plan-42.md'],
  }])
  assert.match(result.error.reason, /handoff --agent "engineer"/)
})

test('evaluateHandoff: a rework dispatch must also name the previous review', () => {
  const reworkState = state({
    verdicts: { DELIVER: 'CHANGES_REQUESTED' },
    reviewArtifacts: { DELIVER: ['reviews/2026-09-30/deliver-review-1.md'] },
  })
  const prompt = 'features/billing-checkout.feature details/2026-09-30/test-plan-42.md fix the findings'
  const result = evaluateHandoff({ agent: 'engineer', state: reworkState, config: CONFIG, prompt })
  assert.equal(result.ok, false)
  assert.deepEqual(result.error.missing, [{ input: 'previous review with the findings', expected: ['reviews/2026-09-30/deliver-review-1.md'] }])
  const complete = evaluateHandoff({ agent: 'engineer', state: reworkState, config: CONFIG, prompt: `${prompt} reviews/2026-09-30/deliver-review-1.md` })
  assert.equal(complete.ok, true)
})

test('evaluateHandoff: unresolved, repository and note inputs are never enforced', () => {
  const result = evaluateHandoff({
    agent: 'architect',
    state: state({ currentPhase: 'DESIGN' }),
    config: CONFIG,
    prompt: 'research/2026-09-30/checkout-research.md',
  })
  assert.equal(result.ok, true)
})

test('evaluateHandoff: a specialist dispatched after approval (ratification) and a non-phase agent pass', () => {
  const approved = state({ currentPhase: 'DESIGN', verdicts: { DESIGN: 'APPROVED' } })
  assert.equal(evaluateHandoff({ agent: 'architect', state: approved, config: CONFIG, prompt: 'ratify ADR-001: accept' }).ok, true)
  assert.equal(evaluateHandoff({ agent: 'cold-reader-lens', state: state(), config: CONFIG, prompt: '' }).ok, true)
})

test('evaluateHandoff: a non-string prompt names nothing', () => {
  const result = evaluateHandoff({ agent: 'engineer', state: state(), config: CONFIG, prompt: undefined })
  assert.equal(result.error.missing.length, 2)
})

test('renderHandoff: lists resolved paths under the tracking prefix and flags what the orchestrator must supply', () => {
  const handoff = buildHandoff({ agent: 'engineer', state: state(), config: CONFIG }).value
  const block = renderHandoff(handoff, { trackingPrefix: '.copilot-tracking/skraft-plans/checkout/' })
  assert.match(block, /^### Handoff \(from `state\.mjs handoff`/)
  assert.match(block, /- Agent: engineer \(DELIVER specialist\)/)
  assert.match(block, /- Mode: first pass/)
  assert.match(block, /`\.copilot-tracking\/skraft-plans\/checkout\/details\/2026-09-30\/test-plan-42\.md`/)
  assert.match(block, /`tests\/\*\*\/\{Feature\}AcceptanceTests\.cs` — supply the exact path/)
  assert.match(block, /- Context inputs — consult when a step needs them:/)
  assert.doesNotMatch(block, /Previous review/)
})

test('renderHandoff: a rework block carries the review, the previous output and the rework instruction', () => {
  const handoff = buildHandoff({
    agent: 'engineer',
    state: state({
      phaseArtifacts: { ...state().phaseArtifacts, DELIVER: ['changes/2026-09-30/change-log.md'] },
      verdicts: { DELIVER: 'CHANGES_REQUESTED' },
      reviewArtifacts: { DELIVER: ['reviews/2026-09-30/deliver-review-1.md'] },
      retryCount: { DELIVER: 1 },
    }),
    config: CONFIG,
  }).value
  const block = renderHandoff(handoff)
  assert.match(block, /- Mode: rework — attempt 2 of 3\. Apply rework mode/)
  assert.match(block, /- Previous review \(its findings drive this pass\): `reviews\/2026-09-30\/deliver-review-1\.md`/)
  assert.match(block, /- Your previous output \(edit it in place\):\n {2}- `changes\/2026-09-30\/change-log\.md`/)
})

test('renderHandoff: an unrecorded tracked input and a note ask the orchestrator to supply them', () => {
  const architect = buildHandoff({ agent: 'architect', state: state({ currentPhase: 'DESIGN' }), config: CONFIG }).value
  assert.match(renderHandoff(architect), /stories-\{milestone\}\.md` — not recorded: supply the exact path/)
  const reviewer = buildHandoff({ agent: 'engineer-reviewer', state: state(), config: CONFIG }).value
  assert.match(renderHandoff(reviewer), /- Source code commits produced by the engineer — supply it/)
  assert.match(renderHandoff(reviewer), /- Mode: first pass/)
})
