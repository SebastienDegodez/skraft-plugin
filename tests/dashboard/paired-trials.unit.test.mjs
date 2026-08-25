import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pairTrials } from '../../eng/lib/paired-trials.mjs'

const trial = ({ stimulus = 'A scenario', trialIndex = 0, score = 0.5, activations = 1, status = 'success', intent } = {}) => ({
  type: 'trial-result',
  stimulus,
  trialIndex,
  status,
  gradeResult: { score },
  trajectory: {
    stimulus: { name: stimulus, tags: intent ? { intent } : {} },
    metrics: { skillActivationCount: activations },
  },
})

const outcomes = (pairing) => pairing.pairs.map((pair) => pair.outcome)

describe('pairing two arms of one comparison', () => {
  it('scores a pair by its grader score, not by any judged trajectory', () => {
    const pairing = pairTrials(
      [trial({ trialIndex: 0, score: 0.4 }), trial({ trialIndex: 1, score: 0.9 }), trial({ trialIndex: 2, score: 0.5 })],
      [trial({ trialIndex: 0, score: 0.8 }), trial({ trialIndex: 1, score: 0.2 }), trial({ trialIndex: 2, score: 0.5 })],
    )

    deepStrictEqual(outcomes(pairing), ['win', 'loss', 'tie'])
    strictEqual(pairing.wins, 1)
    strictEqual(pairing.losses, 1)
    strictEqual(pairing.ties, 1)
    deepStrictEqual(
      pairing.deltas.map((delta) => Math.round(delta * 1000) / 1000),
      [0.4, -0.7, 0],
    )
  })

  it('pairs by the identity of the run, not by its position in the file', () => {
    // Vally appends each trial as it finishes, so with concurrent workers the
    // two arms routinely land in different orders. Matching line-for-line would
    // compare unrelated runs.
    const baseline = [trial({ trialIndex: 2, score: 0.1 }), trial({ trialIndex: 0, score: 0.2 }), trial({ trialIndex: 1, score: 0.3 })]
    const skilled = [trial({ trialIndex: 0, score: 0.2 }), trial({ trialIndex: 1, score: 0.3 }), trial({ trialIndex: 2, score: 0.1 })]

    const pairing = pairTrials(baseline, skilled)

    deepStrictEqual(pairing.deltas, [0, 0, 0])
    strictEqual(pairing.ties, 3)
  })

  it('keeps two stimuli with the same trial index apart', () => {
    const pairing = pairTrials(
      [trial({ stimulus: 'First', score: 0.2 }), trial({ stimulus: 'Second', score: 0.8 })],
      [trial({ stimulus: 'First', score: 0.9 }), trial({ stimulus: 'Second', score: 0.1 })],
    )

    strictEqual(pairing.wins, 1)
    strictEqual(pairing.losses, 1)
    strictEqual(pairing.unmatchedCount, 0)
  })

  it('drops a pair whose skilled run never loaded the skill', () => {
    const pairing = pairTrials(
      [trial({ trialIndex: 0, score: 0.2 }), trial({ trialIndex: 1, score: 0.2 })],
      [trial({ trialIndex: 0, score: 0.9 }), trial({ trialIndex: 1, score: 0.9, activations: 0 })],
    )

    deepStrictEqual(outcomes(pairing), ['win', 'inactivated'])
    strictEqual(pairing.inactivatedCount, 1)
    strictEqual(pairing.wins, 1)
    // The excluded pair contributes no difference to rank either.
    strictEqual(pairing.deltas.length, 1)
  })

  it('keeps a non-activation guard in the tally, where zero activations is the point', () => {
    const pairing = pairTrials(
      [trial({ trialIndex: 0, score: 0.9, intent: 'non-activation' })],
      [trial({ trialIndex: 0, score: 0.4, activations: 0, intent: 'non-activation' })],
    )

    deepStrictEqual(outcomes(pairing), ['loss'])
    strictEqual(pairing.inactivatedCount, 0)
  })

  it('refuses to read an unreported activation metric as a measured absence', () => {
    const skilled = trial({ trialIndex: 0, score: 0.9 })
    delete skilled.trajectory.metrics.skillActivationCount

    const pairing = pairTrials([trial({ trialIndex: 0, score: 0.2 })], [skilled])

    deepStrictEqual(outcomes(pairing), ['win'])
    strictEqual(pairing.inactivatedCount, 0)
    strictEqual(pairing.pairs[0].skillActivationCount, null)
  })

  it('excludes an errored pair rather than scoring its missing grade as a loss', () => {
    const crashed = trial({ trialIndex: 1, status: 'error' })
    delete crashed.gradeResult

    const pairing = pairTrials([trial({ trialIndex: 0, score: 0.2 }), trial({ trialIndex: 1, score: 0.8 })], [trial({ trialIndex: 0, score: 0.5 }), crashed])

    deepStrictEqual(outcomes(pairing), ['win', 'errored'])
    strictEqual(pairing.erroredCount, 1)
    strictEqual(pairing.losses, 0)
  })

  it('counts a run with no counterpart on the other arm as unmatched', () => {
    const pairing = pairTrials(
      [trial({ trialIndex: 0 }), trial({ trialIndex: 1 })],
      [trial({ trialIndex: 0 }), trial({ trialIndex: 2 })],
    )

    strictEqual(pairing.pairs.length, 1)
    // One skilled run had no baseline, one baseline run had no skilled run.
    strictEqual(pairing.unmatchedCount, 2)
  })

  it('summarises the counted pairs only', () => {
    const pairing = pairTrials(
      [trial({ trialIndex: 0, score: 0.2 }), trial({ trialIndex: 1, score: 0 }), trial({ trialIndex: 2, score: 0.6 })],
      [
        trial({ trialIndex: 0, score: 0.4 }),
        trial({ trialIndex: 1, score: 1, activations: 0 }),
        trial({ trialIndex: 2, score: 0.6 }),
      ],
    )

    // The inactivated pair would have dragged both means and the median delta.
    strictEqual(pairing.baselineMean, 0.4)
    strictEqual(pairing.skilledMean, 0.5)
    strictEqual(pairing.medianDelta, 0.1)
  })

  it('ignores the run-summary record Vally appends to each stream', () => {
    const pairing = pairTrials(
      [trial({ trialIndex: 0, score: 0.2 }), { type: 'run-summary', totals: {} }],
      [trial({ trialIndex: 0, score: 0.5 }), { type: 'run-summary', totals: {} }],
    )

    strictEqual(pairing.pairs.length, 1)
    strictEqual(pairing.unmatchedCount, 0)
  })
})

/** A trial whose grade carries per-grader details, one of them the activation check. */
const gradedTrial = ({ trialIndex = 0, rubricScores = [0.5], activated = true, disallowed = false, intent } = {}) => {
  const activation = {
    name: 'The skill under test is loaded',
    kind: 'code',
    passed: disallowed ? !activated : activated,
    score: (disallowed ? !activated : activated) ? 1 : 0,
    metadata: { [disallowed ? 'disallowed' : 'required']: ['a-skill'], skills: activated ? ['a-skill'] : [] },
  }
  const details = [...rubricScores.map((score, index) => ({ name: `Rubric ${index}`, kind: 'llm', passed: score >= 1, score })), activation]

  return {
    type: 'trial-result',
    stimulus: 'A scenario',
    trialIndex,
    status: 'success',
    gradeResult: {
      passed: details.every((detail) => detail.passed),
      // Vally's own aggregate averages every grader, activation check included.
      score: details.reduce((total, detail) => total + detail.score, 0) / details.length,
      details,
    },
    trajectory: {
      stimulus: { name: 'A scenario', tags: intent ? { intent } : {} },
      metrics: { skillActivationCount: activated ? 1 : 0 },
    },
  }
}

describe('keeping the activation check out of the contrast', () => {
  it('scores a pair on the rubric graders alone', () => {
    // The baseline runs with no skills mounted, so it fails the activation check
    // on every stimulus. Counted, that single grader would hand the treatment a
    // standing edge: here both arms scored 0.5 on the rubric, and only the
    // activation check separates Vally's own aggregate.
    const baseline = gradedTrial({ rubricScores: [0.5], activated: false })
    const skilled = gradedTrial({ rubricScores: [0.5], activated: true })

    strictEqual(baseline.gradeResult.score, 0.25)
    strictEqual(skilled.gradeResult.score, 0.75)

    const pairing = pairTrials([baseline], [skilled])

    deepStrictEqual(outcomes(pairing), ['tie'])
    strictEqual(pairing.pairs[0].baselineScore, 0.5)
    strictEqual(pairing.pairs[0].skilledScore, 0.5)
    strictEqual(pairing.wins, 0)
  })

  it('still separates the arms when the rubric graders disagree', () => {
    const pairing = pairTrials(
      [gradedTrial({ rubricScores: [0.4, 0.6], activated: false })],
      [gradedTrial({ rubricScores: [0.8, 0.8], activated: true })],
    )

    deepStrictEqual(outcomes(pairing), ['win'])
    strictEqual(pairing.pairs[0].baselineScore, 0.5)
    strictEqual(pairing.pairs[0].skilledScore, 0.8)
  })

  it('drops the pair when the spec grader says the skill never loaded', () => {
    const skilled = gradedTrial({ rubricScores: [0.9], activated: false })
    // The runner metric disagrees — the grader names the skill, so it wins.
    skilled.trajectory.metrics.skillActivationCount = 2

    const pairing = pairTrials([gradedTrial({ rubricScores: [0.2], activated: false })], [skilled])

    deepStrictEqual(outcomes(pairing), ['inactivated'])
    strictEqual(pairing.inactivatedCount, 1)
    strictEqual(pairing.pairs[0].activationGraderPassed, false)
  })

  it('keeps a near-miss pair whose guard held', () => {
    // `disallowed` passing means the skill correctly stayed out. That is the
    // outcome under test, not a failed measurement.
    const pairing = pairTrials(
      [gradedTrial({ rubricScores: [0.4], activated: false, disallowed: true, intent: 'non-activation' })],
      [gradedTrial({ rubricScores: [0.7], activated: false, disallowed: true, intent: 'non-activation' })],
    )

    deepStrictEqual(outcomes(pairing), ['win'])
    strictEqual(pairing.inactivatedCount, 0)
    strictEqual(pairing.pairs[0].activationGraderPassed, true)
  })

  it('falls back to the aggregate when the spec declares no activation check', () => {
    const pairing = pairTrials([trial({ trialIndex: 0, score: 0.2 })], [trial({ trialIndex: 0, score: 0.6 })])

    deepStrictEqual(outcomes(pairing), ['win'])
    strictEqual(pairing.pairs[0].skilledScore, 0.6)
    strictEqual(pairing.pairs[0].activationGraderPassed, null)
  })
})

describe('saying where the ties landed', () => {
  it('separates a ceiling tie from one in the middle and one at the floor', () => {
    const pairing = pairTrials(
      [trial({ trialIndex: 0, score: 1 }), trial({ trialIndex: 1, score: 0.5 }), trial({ trialIndex: 2, score: 0 })],
      [trial({ trialIndex: 0, score: 1 }), trial({ trialIndex: 1, score: 0.5 }), trial({ trialIndex: 2, score: 0 })],
    )

    strictEqual(pairing.ties, 3)
    deepStrictEqual(pairing.tieBreakdown, { ceiling: 1, floor: 1, middle: 1 })
    deepStrictEqual(
      pairing.pairs.map((pair) => pair.tieKind),
      ['ceiling', 'middle', 'floor'],
    )
  })

  it('leaves a decided pair unclassified', () => {
    const pairing = pairTrials([trial({ trialIndex: 0, score: 0.2 })], [trial({ trialIndex: 0, score: 0.8 })])

    strictEqual(pairing.pairs[0].tieKind, null)
    deepStrictEqual(pairing.tieBreakdown, { ceiling: 0, floor: 0, middle: 0 })
  })
})
