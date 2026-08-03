import { ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MIN_CREDIBLE_TRIALS, comparisonVerdict, signTestPValue, verdictState } from '../../eng/lib/verdict.mjs'

const report = (summary, extra = {}) => ({ summary, ...extra })
const evaluation = { skill: 'outside-in-tdd', skillPath: 'plugins/skills/outside-in-tdd' }

describe('sign test', () => {
  it('is certain when nothing is discordant', () => {
    strictEqual(signTestPValue(0, 0), 1)
  })

  it('never reports a wins-only tally as more extreme than certain', () => {
    ok(signTestPValue(9, 0) <= 1)
    ok(signTestPValue(9, 0) < 0.05)
  })

  it('treats a symmetric tally as pure noise', () => {
    strictEqual(signTestPValue(3, 3), 1)
  })

  it('is symmetric in wins and losses', () => {
    strictEqual(signTestPValue(7, 2), signTestPValue(2, 7))
  })
})

describe('comparison verdict', () => {
  it('passes a clean, powered, significant win', () => {
    const verdict = comparisonVerdict(report({ wins: 8, ties: 1, losses: 0, trialCount: 9 }), evaluation)

    strictEqual(verdict.passed, true)
    strictEqual(verdict.regressed, false)
    strictEqual(verdictState(verdict), 'pass')
    ok(verdict.reason.includes('credibly better'))
  })

  it('flags a clean, powered, significant loss as a regression', () => {
    const verdict = comparisonVerdict(report({ wins: 0, ties: 1, losses: 8, trialCount: 9 }), evaluation)

    strictEqual(verdict.regressed, true)
    strictEqual(verdict.passed, false)
    strictEqual(verdictState(verdict), 'regression')
  })

  it('refuses to call a two-trial win credible', () => {
    const verdict = comparisonVerdict(report({ wins: 2, ties: 0, losses: 0, trialCount: 2 }), evaluation)

    strictEqual(verdict.underpowered, true)
    strictEqual(verdict.passed, false)
    strictEqual(verdictState(verdict), 'inconclusive')
    ok(verdict.reason.includes(String(MIN_CREDIBLE_TRIALS)))
  })

  it('refuses to conclude when a trial errored', () => {
    const verdict = comparisonVerdict(report({ wins: 8, ties: 0, losses: 0, trialCount: 9, erroredCount: 1 }), evaluation)

    strictEqual(verdict.conclusive, false)
    strictEqual(verdict.passed, false)
    strictEqual(verdictState(verdict), 'inconclusive')
  })

  it('refuses to conclude when a trial is unmatched between the two variants', () => {
    const verdict = comparisonVerdict(report({ wins: 9, ties: 0, losses: 0, trialCount: 9 }, { unmatchedTreatment: ['trial-3'] }), evaluation)

    strictEqual(verdict.conclusive, false)
    strictEqual(verdict.unmatchedTrialCount, 1)
  })

  it('reports a non-significant margin as no improvement rather than a pass', () => {
    const verdict = comparisonVerdict(report({ wins: 4, ties: 1, losses: 3, trialCount: 8 }), evaluation)

    strictEqual(verdict.passed, false)
    strictEqual(verdict.regressed, false)
    strictEqual(verdictState(verdict), 'no-improvement')
  })

  it('carries the net win and the identity of the skill under test', () => {
    const verdict = comparisonVerdict(report({ wins: 6, ties: 0, losses: 2, trialCount: 8 }), evaluation)

    strictEqual(verdict.netWin, 0.5)
    strictEqual(verdict.skillName, 'outside-in-tdd')
    strictEqual(verdict.skillPath, 'plugins/skills/outside-in-tdd')
  })
})
