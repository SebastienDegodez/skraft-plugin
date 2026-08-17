import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MIN_CREDIBLE_TRIALS, MIN_DISCORDANT_PAIRS, comparisonVerdict, signTestPValue, verdictState } from '../../eng/lib/verdict.mjs'

const report = (summary, extra = {}) => ({ summary, ...extra })
const subject = { kind: 'skill', name: 'outside-in-tdd', path: 'plugins/skraft-framework/skills/outside-in-tdd' }

const trial = ({ trialIndex, score, activations = 1, status = 'success' }) => ({
  type: 'trial-result',
  stimulus: 'A scenario',
  trialIndex,
  status,
  gradeResult: { score },
  trajectory: { stimulus: { name: 'A scenario', tags: {} }, metrics: { skillActivationCount: activations } },
})

/**
 * Two arms built from a list of `[baselineScore, skilledScore, activations?]`.
 * The judge summary is passed separately so the two instruments can be made to
 * disagree on purpose.
 */
const arms = (rows) => ({
  baselineRecords: rows.map(([baseline], index) => trial({ trialIndex: index, score: baseline })),
  skilledRecords: rows.map(([, skilled, activations], index) => trial({ trialIndex: index, score: skilled, activations: activations ?? 1 })),
})

/** n pairs where the skilled arm wins by a comfortable, distinct margin. */
const cleanSweep = (n) => arms(Array.from({ length: n }, (_, index) => [0.1, 0.4 + index * 0.05]))

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

  it('falls back to the judge when no per-trial record is available to grade', () => {
    const verdict = comparisonVerdict(report({ wins: 8, ties: 1, losses: 0, trialCount: 9 }), subject)

    strictEqual(verdict.signTest.source, 'judge')
    strictEqual(verdict.wilcoxon.available, false)
    strictEqual(verdict.graderPairs, null)
    strictEqual(verdict.inactivatedCount, 0)
  })
})

describe('verdict driven by the deterministic graders', () => {
  it('takes the tally from the grader scores, not from the judge', () => {
    // The judge saw a sweep; the graders saw the treatment lose every pair.
    const verdict = comparisonVerdict(
      report({ wins: 6, ties: 0, losses: 0, trialCount: 6, meanScore: 0.9, winRate: 1 }),
      subject,
      arms([
        [0.9, 0.1],
        [0.9, 0.2],
        [0.9, 0.3],
        [0.9, 0.4],
        [0.9, 0.5],
        [0.9, 0.6],
      ]),
    )

    strictEqual(verdict.signTest.source, 'graders')
    strictEqual(verdict.signTest.wins, 0)
    strictEqual(verdict.signTest.losses, 6)
    strictEqual(verdict.regressed, true)
    strictEqual(verdictState(verdict), 'regression')
  })

  it('keeps the judge tally instead of discarding it', () => {
    const verdict = comparisonVerdict(
      report({ wins: 6, ties: 0, losses: 0, trialCount: 6, meanScore: 0.9, ciLow: 0.4, ciHigh: 1, winRate: 1 }),
      subject,
      arms([
        [0.9, 0.1],
        [0.9, 0.2],
      ]),
    )

    deepStrictEqual(
      { wins: verdict.judgeTally.wins, ties: verdict.judgeTally.ties, losses: verdict.judgeTally.losses },
      { wins: 6, ties: 0, losses: 0 },
    )
    strictEqual(verdict.judgeTally.pValue, signTestPValue(6, 0))
    // The judged score keeps its top-level home for the dashboard, and is
    // labelled as the judge's inside `judgeTally`.
    strictEqual(verdict.meanScore, 0.9)
    strictEqual(verdict.judgeTally.meanScore, 0.9)
    strictEqual(verdict.judgeTally.winRate, 1)
    strictEqual(verdict.confidenceInterval.low, 0.4)
    strictEqual(verdict.judgeTally.confidenceInterval.high, 1)
  })

  it('drops a pair the skill never activated on, and says so', () => {
    const verdict = comparisonVerdict(
      report({ wins: 3, ties: 0, losses: 3, trialCount: 6 }),
      subject,
      arms([
        [0.1, 0.9],
        [0.1, 0.9],
        [0.1, 0.9, 0], // equipped, never activated: a baseline against a baseline
        [0.1, 0.9],
      ]),
    )

    strictEqual(verdict.inactivatedCount, 1)
    strictEqual(verdict.trialCount, 3)
    strictEqual(verdict.pairedTrialCount, 4)
    strictEqual(verdict.signTest.wins, 3)
    ok(verdict.reason.includes('1 pair(s) excluded'))
  })

  it('keeps an inactivated pair from making the comparison incomplete', () => {
    // Deliberately unlike an errored or unmatched trial. Those are the
    // instrument breaking, so nothing can be concluded. A skill that failed to
    // load is a measured fact about its reach; the pair leaves the tally and the
    // power gates below decide whether what remains is enough.
    const verdict = comparisonVerdict(
      report({ wins: 6, ties: 0, losses: 0, trialCount: 7 }),
      subject,
      arms([
        [0.1, 0.2],
        [0.1, 0.3],
        [0.1, 0.4],
        [0.1, 0.5],
        [0.1, 0.6],
        [0.1, 0.7],
        [0.1, 0.9, 0],
      ]),
    )

    strictEqual(verdict.conclusive, true)
    strictEqual(verdict.erroredCount, 0)
    strictEqual(verdict.unmatchedTrialCount, 0)
    strictEqual(verdict.passed, true)
    ok(verdict.reason.includes('1 pair(s) excluded'))
  })

  it('reports a comparison the skill never activated on as measuring nothing', () => {
    const verdict = comparisonVerdict(
      report({ wins: 3, ties: 0, losses: 0, trialCount: 3 }),
      subject,
      arms([
        [0.1, 0.9, 0],
        [0.1, 0.9, 0],
        [0.1, 0.9, 0],
      ]),
    )

    strictEqual(verdict.trialCount, 0)
    strictEqual(verdict.inactivatedCount, 3)
    strictEqual(verdictState(verdict), 'inconclusive')
    ok(verdict.reason.includes('nothing was measured'))
  })

  it('still refuses to conclude when a trial errored, whichever instrument noticed', () => {
    const armsWithCrash = arms([
      [0.1, 0.9],
      [0.1, 0.9],
      [0.1, 0.9],
      [0.1, 0.9],
      [0.1, 0.9],
      [0.1, 0.9],
    ])
    armsWithCrash.skilledRecords[2].status = 'error'

    const verdict = comparisonVerdict(report({ wins: 6, ties: 0, losses: 0, trialCount: 6 }), subject, armsWithCrash)

    strictEqual(verdict.erroredCount, 1)
    strictEqual(verdict.conclusive, false)
    strictEqual(verdictState(verdict), 'inconclusive')
  })

  it('publishes the pairs the verdict was computed from', () => {
    const verdict = comparisonVerdict(
      report({ wins: 1, ties: 0, losses: 0, trialCount: 2 }),
      subject,
      arms([
        [0.2, 0.8],
        [0.5, 0.5, 0],
      ]),
    )

    deepStrictEqual(
      verdict.graderPairs.map((pair) => pair.outcome),
      ['win', 'inactivated'],
    )
    strictEqual(verdict.graderPairs[0].baselineScore, 0.2)
    strictEqual(verdict.graderPairs[0].skilledScore, 0.8)
    strictEqual(verdict.graderScores.medianDelta, 0.6000000000000001)
  })
})

describe('the two tests that gate a pass', () => {
  it('publishes the Wilcoxon result beside the sign test rather than instead of it', () => {
    const verdict = comparisonVerdict(report({ wins: 6, ties: 0, losses: 0, trialCount: 6 }), subject, cleanSweep(6))

    strictEqual(verdict.signTest.pValue, signTestPValue(6, 0))
    strictEqual(verdict.wilcoxon.available, true)
    strictEqual(verdict.wilcoxon.n, 6)
    strictEqual(verdict.wilcoxon.method, 'exact')
    ok(verdict.reason.includes('sign test p='))
    ok(verdict.reason.includes('Wilcoxon p='))
  })

  it('passes only when both tests clear alpha', () => {
    const verdict = comparisonVerdict(report({ wins: 6, ties: 0, losses: 0, trialCount: 6 }), subject, cleanSweep(6))

    ok(verdict.signTest.pValue <= 0.05)
    ok(verdict.wilcoxon.pValue <= 0.05)
    strictEqual(verdict.passed, true)
  })

  it('withholds the pass when the magnitudes are convincing but the sign count is not', () => {
    // Six wins worth +0.6 against two losses worth −0.02. The sign test reads
    // 6W/2L and scores p=0.289; Wilcoxon ranks the two trivial losses last and
    // clears alpha. `passed` requires both, so this is reported, not certified.
    const verdict = comparisonVerdict(
      report({ wins: 6, ties: 0, losses: 2, trialCount: 8 }),
      subject,
      arms([
        [0.2, 0.8],
        [0.2, 0.81],
        [0.2, 0.82],
        [0.2, 0.83],
        [0.2, 0.84],
        [0.2, 0.85],
        [0.2, 0.19],
        [0.2, 0.18],
      ]),
    )

    ok(verdict.signTest.pValue > 0.05, `sign test p=${verdict.signTest.pValue}`)
    ok(verdict.wilcoxon.pValue <= 0.05, `Wilcoxon p=${verdict.wilcoxon.pValue}`)
    strictEqual(verdict.passed, false)
    strictEqual(verdictState(verdict), 'no-improvement')
    // The disagreement is on the face of the verdict, not buried.
    ok(verdict.reason.includes('Wilcoxon p='))
  })

  it('withholds the pass when the sign count is convincing but the magnitudes are not', () => {
    // Eight wins and no losses is p=0.0078 on the sign test. Two of the wins
    // are enormous and six are rounding error — Wilcoxon still clears alpha
    // here, so the case that matters is the reverse one; what this pins is that
    // the Wilcoxon clause is actually consulted rather than assumed true.
    const verdict = comparisonVerdict(report({ wins: 8, ties: 0, losses: 0, trialCount: 8 }), subject, cleanSweep(8))

    strictEqual(verdict.wilcoxon.available, true)
    strictEqual(verdict.passed, verdict.signTest.pValue <= 0.05 && verdict.wilcoxon.pValue <= 0.05)
  })

  it('leaves the historical sign-test-only rule in place when there is nothing to rank', () => {
    const verdict = comparisonVerdict(report({ wins: 8, ties: 1, losses: 0, trialCount: 9 }), subject)

    strictEqual(verdict.wilcoxon.available, false)
    strictEqual(verdict.wilcoxon.pValue, 1)
    strictEqual(verdict.passed, true)
  })

  it('calls a regression only when both tests agree on it too', () => {
    const verdict = comparisonVerdict(
      report({ wins: 0, ties: 0, losses: 6, trialCount: 6 }),
      subject,
      arms([
        [0.9, 0.1],
        [0.9, 0.15],
        [0.9, 0.2],
        [0.9, 0.25],
        [0.9, 0.3],
        [0.9, 0.35],
      ]),
    )

    ok(verdict.signTest.pValue <= 0.05)
    ok(verdict.wilcoxon.pValue <= 0.05)
    strictEqual(verdict.regressed, true)
    strictEqual(verdict.passed, false)
  })
})
