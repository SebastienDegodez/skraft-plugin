// Unit tests of the phase check marks (domain/pipeline/phase-steps-policy.mjs): every step
// of every phase kind, with its exact label, status and detail.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { phaseSteps } from '../../../plugins/skraft-framework/src/domain/pipeline/phase-steps-policy.mjs'

const phase = (overrides) => ({ name: 'DESIGN', status: 'active', artifacts: [], reviews: [], specialist: 'architect', reviewer: 'architect-reviewer', ...overrides })
const context = (overrides = {}) => ({ structuralScan: false, adrRatification: null, qualityGates: null, reports: [], ...overrides })
const s = (id, label, status, detail = null) => ({ id, label, status, detail })

test('steps: an active DESIGN — scan done, one file, a review asking rework under way, the ADRs ratified', () => {
  const steps = phaseSteps(
    phase({ artifacts: ['design/a.md'], reviews: [{ verdict: 'NEEDS_REWORK' }] }),
    context({ structuralScan: true, adrRatification: { checkpointStatus: 'resolved' } }),
  )
  assert.deepEqual(steps, [
    s('structural-scan', 'Structural scan of the code', 'done'),
    s('outputs', 'architect wrote its outputs', 'done', '1 file'),
    s('review', 'architect-reviewer approved', 'running', '1 review, last needs rework'),
    s('adr-ratification', 'Proposed ADRs ratified', 'done'),
    s('closed', 'Phase closed', 'pending'),
  ])
})

test('steps: a closed DESIGN — scan skipped, files counted, a rejected last review still closes, the ratification done', () => {
  const steps = phaseSteps(
    phase({ status: 'done', artifacts: ['design/a.md', 'design/b.md'], reviews: [{ verdict: 'NEEDS_REWORK' }, { verdict: 'REJECTED' }] }),
    context(),
  )
  assert.deepEqual(steps, [
    s('structural-scan', 'Structural scan of the code', 'skipped'),
    s('outputs', 'architect wrote its outputs', 'done', '2 files'),
    s('review', 'architect-reviewer approved', 'done', '2 reviews, last rejected'),
    s('adr-ratification', 'Proposed ADRs ratified', 'done'),
    s('closed', 'Phase closed', 'done'),
  ])
})

test('steps: an open DESIGN with no run — a review asking rework has failed, the ADRs wait for the human', () => {
  const steps = phaseSteps(
    phase({ status: 'open', specialist: null, reviews: [{ verdict: 'APPROVED' }, { verdict: 'NEEDS_REWORK' }] }),
    context({ adrRatification: { checkpointStatus: 'awaiting_human' } }),
  )
  assert.deepEqual(steps, [
    s('structural-scan', 'Structural scan of the code', 'pending'),
    s('outputs', 'Specialist wrote its outputs', 'pending'),
    s('review', 'architect-reviewer approved', 'failed', '2 reviews, last needs rework'),
    s('adr-ratification', 'Proposed ADRs ratified', 'waiting'),
    s('closed', 'Phase closed', 'pending'),
  ])
})

test('steps: an approved last review is done; an unread one leaves the review to come', () => {
  const approved = phaseSteps(phase({ artifacts: ['a.md'], reviews: [{ verdict: 'APPROVED' }] }), context())
  assert.deepEqual(approved.find((step) => step.id === 'review'), s('review', 'architect-reviewer approved', 'done', '1 review, last approved'))

  const unread = phaseSteps(
    phase({ name: 'DISTILL', status: 'awaiting', specialist: 'acceptance-designer', reviewer: 'acceptance-reviewer', artifacts: ['a.md'], reviews: [{ verdict: 'APPROVED' }, { verdict: null }] }),
    context({ reports: [{ kind: 'outcome' }] }),
  )
  assert.deepEqual(unread, [
    s('outputs', 'acceptance-designer wrote its outputs', 'done', '1 file'),
    s('review', 'acceptance-reviewer approved', 'pending', '2 reviews, last unread'),
    s('forecast-report', 'Forecast report rendered', 'pending'),
    s('closed', 'Phase closed', 'waiting'),
  ])
})

test('steps: DISTILL renders its forecast report, and a closed one without it skipped it', () => {
  const rendered = phaseSteps(phase({ name: 'DISTILL', status: 'active', reviewer: null }), context({ reports: [{ kind: 'forecast' }] }))
  assert.deepEqual(rendered, [
    s('outputs', 'architect wrote its outputs', 'running'),
    s('forecast-report', 'Forecast report rendered', 'done'),
    s('closed', 'Phase closed', 'pending'),
  ])
  const skipped = phaseSteps(phase({ name: 'DISTILL', status: 'done', reviewer: null, artifacts: ['x.md'] }), context())
  assert.equal(skipped.find((step) => step.id === 'forecast-report').status, 'skipped')
})

test('steps: DELIVER active, nothing written yet — the gates and the review wait for the outputs', () => {
  const steps = phaseSteps(phase({ name: 'DELIVER', specialist: 'engineer', reviewer: 'engineer-reviewer' }), context())
  assert.deepEqual(steps, [
    s('outputs', 'engineer wrote its outputs', 'running'),
    s('quality-gates', 'Quality gates verified by the code', 'pending'),
    s('review', 'engineer-reviewer approved', 'pending'),
    s('outcome-report', 'Outcome report rendered', 'pending'),
    s('closed', 'Phase closed', 'pending'),
  ])
})

test('steps: DELIVER active with its outputs — the gates and the review are under way', () => {
  const steps = phaseSteps(phase({ name: 'DELIVER', specialist: 'engineer', reviewer: 'engineer-reviewer', artifacts: ['e.json'] }), context())
  assert.deepEqual(steps.map((step) => [step.id, step.status]), [
    ['outputs', 'done'], ['quality-gates', 'running'], ['review', 'running'], ['outcome-report', 'pending'], ['closed', 'pending'],
  ])
})

test('steps: DELIVER blocked on failed gates — the verdict is the detail, the outcome report rendered, the phase failed', () => {
  const steps = phaseSteps(
    phase({ name: 'DELIVER', status: 'blocked', specialist: 'engineer', reviewer: 'engineer-reviewer', artifacts: ['e.json'] }),
    context({ qualityGates: { verdict: 'fail' }, reports: [{ kind: 'outcome' }] }),
  )
  assert.deepEqual(steps, [
    s('outputs', 'engineer wrote its outputs', 'done', '1 file'),
    s('quality-gates', 'Quality gates verified by the code', 'failed', 'fail'),
    s('review', 'engineer-reviewer approved', 'pending'),
    s('outcome-report', 'Outcome report rendered', 'done'),
    s('closed', 'Phase closed', 'failed'),
  ])
})

test('steps: DELIVER closed — passed gates carry no detail, unverified gates and a missing report were skipped', () => {
  const passed = phaseSteps(
    phase({ name: 'DELIVER', status: 'done', specialist: 'engineer', reviewer: 'engineer-reviewer', artifacts: ['e.json'] }),
    context({ qualityGates: { verdict: 'pass' } }),
  )
  assert.deepEqual(passed, [
    s('outputs', 'engineer wrote its outputs', 'done', '1 file'),
    s('quality-gates', 'Quality gates verified by the code', 'done'),
    s('review', 'engineer-reviewer approved', 'done'),
    s('outcome-report', 'Outcome report rendered', 'skipped'),
    s('closed', 'Phase closed', 'done'),
  ])
  const unverified = phaseSteps(phase({ name: 'DELIVER', status: 'done', reviewer: null }), context())
  assert.deepEqual(unverified.find((step) => step.id === 'quality-gates'), s('quality-gates', 'Quality gates verified by the code', 'skipped'))
  const inconclusive = phaseSteps(phase({ name: 'DELIVER', status: 'active', reviewer: null }), context({ qualityGates: { verdict: 'inconclusive' } }))
  assert.deepEqual(inconclusive.find((step) => step.id === 'quality-gates'), s('quality-gates', 'Quality gates verified by the code', 'failed', 'inconclusive'))
})

test('steps: RESEARCH (no reviewer) not reached yet — only its outputs and its closure, both pending', () => {
  assert.deepEqual(phaseSteps(phase({ name: 'RESEARCH', status: 'pending', specialist: 'researcher', reviewer: null }), context()), [
    s('outputs', 'researcher wrote its outputs', 'pending'),
    s('closed', 'Phase closed', 'pending'),
  ])
})
