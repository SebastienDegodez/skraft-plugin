import { ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MIN_CREDIBLE_TRIALS, MIN_DISCORDANT_PAIRS, comparisonVerdict, signTestPValue, verdictState } from '../../eng/lib/verdict.mjs'

const report = (summary, extra = {}) => ({ summary, ...extra })
const subject = { kind: 'skill', name: 'outside-in-tdd', path: 'plugins/skraft-framework/skills/outside-in-tdd' }

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
    const verdict = comparisonVerdict(report({ wins: 8, ties: 1, losses: 0, trialCount: 9 }), subject)

    strictEqual(verdict.passed, true)
    strictEqual(verdict.regressed, false)
    strictEqual(verdictState(verdict), 'pass')
    ok(verdict.reason.includes('credibly better'))
  })

  it('flags a clean, powered, significant loss as a regression', () => {
    const verdict = comparisonVerdict(report({ wins: 0, ties: 1, losses: 8, trialCount: 9 }), subject)

    strictEqual(verdict.regressed, true)
    strictEqual(verdict.passed, false)
    strictEqual(verdictState(verdict), 'regression')
  })

  it('refuses to call a two-trial win credible', () => {
    const verdict = comparisonVerdict(report({ wins: 2, ties: 0, losses: 0, trialCount: 2 }), subject)

    strictEqual(verdict.underpowered, true)
    strictEqual(verdict.passed, false)
    strictEqual(verdictState(verdict), 'inconclusive')
    ok(verdict.reason.includes(String(MIN_CREDIBLE_TRIALS)))
  })

  it('refuses to blame the skill for a sweep the sign test could never certify', () => {
    // 5W/0L is the best possible outcome at five discordant pairs and still
    // scores p=0.0625. Calling that "no improvement" would report a budget
    // failure as a skill failure.
    const verdict = comparisonVerdict(report({ wins: 5, ties: 0, losses: 0, trialCount: 5 }), subject)

    strictEqual(verdict.underpowered, true)
    strictEqual(verdict.passed, false)
    strictEqual(verdictState(verdict), 'inconclusive')
    ok(verdict.reason.includes(String(MIN_DISCORDANT_PAIRS)))
  })

  it('treats an all-tie comparison as a measured absence of difference, not a power failure', () => {
    const verdict = comparisonVerdict(report({ wins: 0, ties: 12, losses: 0, trialCount: 12 }), subject)

    strictEqual(verdict.underpowered, false)
    strictEqual(verdictState(verdict), 'no-improvement')
  })

  it('separates a powered non-significant margin from an unpowered one', () => {
    // 7W/1L clears the discordant floor, so the margin itself is what fails.
    const verdict = comparisonVerdict(report({ wins: 7, ties: 4, losses: 1, trialCount: 12 }), subject)

    strictEqual(verdict.underpowered, false)
    strictEqual(verdictState(verdict), 'no-improvement')
    ok(verdict.reason.includes('no credible improvement'))
  })

  it('refuses to conclude when a trial errored', () => {
    const verdict = comparisonVerdict(report({ wins: 8, ties: 0, losses: 0, trialCount: 9, erroredCount: 1 }), subject)

    strictEqual(verdict.conclusive, false)
    strictEqual(verdict.passed, false)
    strictEqual(verdictState(verdict), 'inconclusive')
  })

  it('refuses to conclude when a trial is unmatched between the two variants', () => {
    const verdict = comparisonVerdict(report({ wins: 9, ties: 0, losses: 0, trialCount: 9 }, { unmatchedTreatment: ['trial-3'] }), subject)

    strictEqual(verdict.conclusive, false)
    strictEqual(verdict.unmatchedTrialCount, 1)
  })

  it('reports a non-significant margin as no improvement rather than a pass', () => {
    const verdict = comparisonVerdict(report({ wins: 4, ties: 1, losses: 3, trialCount: 8 }), subject)

    strictEqual(verdict.passed, false)
    strictEqual(verdict.regressed, false)
    strictEqual(verdictState(verdict), 'no-improvement')
  })

  it('carries the net win and the identity of the subject under test', () => {
    const verdict = comparisonVerdict(report({ wins: 6, ties: 0, losses: 2, trialCount: 8 }), subject)

    strictEqual(verdict.netWin, 0.5)
    strictEqual(verdict.subject.kind, 'skill')
    strictEqual(verdict.subject.name, 'outside-in-tdd')
    strictEqual(verdict.subject.path, 'plugins/skraft-framework/skills/outside-in-tdd')
  })

  it('judges an agent by exactly the same bar as a skill', () => {
    const agent = { kind: 'agent', name: 'skraft-orchestrator', path: 'plugins/skraft-framework/agents/skraft-orchestrator.agent.md' }
    const verdict = comparisonVerdict(report({ wins: 8, ties: 1, losses: 0, trialCount: 9 }), agent)

    strictEqual(verdict.passed, true)
    strictEqual(verdict.subject.kind, 'agent')
  })
})
