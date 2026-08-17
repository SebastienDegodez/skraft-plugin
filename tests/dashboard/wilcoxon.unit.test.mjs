import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { WILCOXON_EXACT_MAX_N, doubledMidRanks, wilcoxonSignedRank } from '../../eng/lib/wilcoxon.mjs'

const close = (actual, expected, tolerance = 1e-12) =>
  ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`)

/**
 * The two-sided p-value, recomputed the long way: literally enumerate all 2^n
 * sign assignments of the rank vector. The module accumulates the same
 * distribution by dynamic programming, so this is the reference the fast path
 * has to reproduce.
 */
const bruteForcePValue = (deltas) => {
  const nonZero = deltas.filter((delta) => delta !== 0)
  const { doubledRanks } = doubledMidRanks(nonZero.map(Math.abs))
  const total = doubledRanks.reduce((sum, rank) => sum + rank, 0)

  let observed = 0
  for (let index = 0; index < nonZero.length; index += 1) if (nonZero[index] > 0) observed += doubledRanks[index]
  const statistic = Math.min(observed, total - observed)

  let extreme = 0
  for (let mask = 0; mask < 2 ** nonZero.length; mask += 1) {
    let sum = 0
    for (let index = 0; index < nonZero.length; index += 1) if (mask & (1 << index)) sum += doubledRanks[index]
    if (sum <= statistic || sum >= total - statistic) extreme += 1
  }
  return extreme / 2 ** nonZero.length
}

/** n positive differences of distinct sizes: the most extreme result possible at that n. */
const sweep = (n) => Array.from({ length: n }, (_, index) => index + 1)

/**
 * Differences whose signed ranks put the smaller rank sum at exactly `statistic`.
 *
 * Ranks 1..n on distinct magnitudes; the subset summing to `statistic` is made
 * negative and everything else positive.
 */
const atStatistic = (n, statistic) => {
  const negatives = new Set()
  let remaining = statistic
  for (let rank = n; rank >= 1; rank -= 1) {
    if (rank <= remaining) {
      negatives.add(rank)
      remaining -= rank
    }
  }
  strictEqual(remaining, 0, `rank sum ${statistic} is not reachable at n=${n}`)
  return sweep(n).map((rank) => (negatives.has(rank) ? -rank : rank))
}

describe('signed mid-ranks', () => {
  it('ranks distinct magnitudes 1..n', () => {
    const { doubledRanks, tieGroupSizes } = doubledMidRanks([0.3, 0.1, 0.2])
    deepStrictEqual(doubledRanks, [6, 2, 4])
    deepStrictEqual(tieGroupSizes, [])
  })

  it('shares the average rank across a tie', () => {
    // Magnitudes 0.5, 0.5, 0.9 span ranks 1, 2, 3: the tie takes (1+2)/2 = 1.5.
    const { doubledRanks, tieGroupSizes } = doubledMidRanks([0.5, 0.5, 0.9])
    deepStrictEqual(doubledRanks, [3, 3, 6])
    deepStrictEqual(tieGroupSizes, [2])
  })
})

describe('Wilcoxon signed-rank test', () => {
  it('cannot reject anything when every pair tied', () => {
    const result = wilcoxonSignedRank([0, 0, 0])
    strictEqual(result.n, 0)
    strictEqual(result.zeroCount, 3)
    strictEqual(result.pValue, 1)
    strictEqual(result.method, 'degenerate')
  })

  it('drops zero differences from n instead of ranking them', () => {
    const result = wilcoxonSignedRank([0.2, 0, -0.1, 0])
    strictEqual(result.n, 2)
    strictEqual(result.zeroCount, 2)
  })

  it('splits the rank sum between the two signs', () => {
    // Magnitudes 0.1, 0.2, 0.3 take ranks 1, 2, 3; only the smallest is negative.
    const result = wilcoxonSignedRank([0.3, -0.1, 0.2])
    strictEqual(result.positiveRankSum, 5)
    strictEqual(result.negativeRankSum, 1)
    strictEqual(result.statistic, 1)
  })

  it('is symmetric under a sign flip', () => {
    const deltas = [0.4, -0.1, 0.25, 0.3, -0.05, 0.2]
    strictEqual(wilcoxonSignedRank(deltas).pValue, wilcoxonSignedRank(deltas.map((delta) => -delta)).pValue)
  })

  // --- hand-computable cases ------------------------------------------------

  it('reports certainty on a single pair, which no two-sided test can reject', () => {
    // One difference, two equally likely sign assignments; both are "at least as
    // extreme" as the one observed. p = 2/2.
    strictEqual(wilcoxonSignedRank([0.9]).pValue, 1)
  })

  it('scores a two-pair sweep at exactly 0.5', () => {
    // Ranks {1,2}: the four sign assignments give W+ of 0, 1, 2, 3. W+ = 3 is
    // matched only by W+ = 0, so p = 2/4.
    strictEqual(wilcoxonSignedRank([0.4, 0.7]).pValue, 0.5)
  })

  it('scores a clean six-pair sweep at 2/64', () => {
    // The floor of the test at n = 6: only the all-positive and all-negative
    // assignments reach W = 0.
    close(wilcoxonSignedRank(sweep(6).map((rank) => rank / 10)).pValue, 2 / 64)
  })

  it('cannot reach 0.05 with five pairs however clean the sweep', () => {
    close(wilcoxonSignedRank(sweep(5).map((rank) => rank / 10)).pValue, 2 / 32)
    ok(wilcoxonSignedRank(sweep(5).map((rank) => rank / 10)).pValue > 0.05)
  })

  it('handles tied mid-ranks by enumerating the ranks themselves', () => {
    // Deltas +0.625, -0.03125, +0.625 → ranks 2.5, 1, 2.5, W+ = 5, W- = 1, W = 1.
    // Doubled ranks {5,2,5} give W+ sums 0,2,5,5,7,7,10,12 over eight equally
    // likely assignments; four of them are <= 2 or >= 10. p = 4/8.
    const result = wilcoxonSignedRank([0.625, -0.03125, 0.625])
    strictEqual(result.statistic, 1)
    close(result.pValue, 0.5)
  })

  // --- published reference tables -------------------------------------------

  it('reproduces the two-sided 0.05 critical values of the published table', () => {
    // Largest W still significant at alpha = 0.05, two-sided, for n = 6..20 —
    // the standard Wilcoxon signed-rank critical-value table. The definition of
    // a critical value is what is asserted: p(W) <= 0.05 < p(W + 1).
    const critical = { 6: 0, 7: 2, 8: 3, 9: 5, 10: 8, 11: 10, 12: 13, 13: 17, 14: 21, 15: 25, 16: 29, 17: 34, 18: 40, 19: 46, 20: 52 }

    for (const [size, bound] of Object.entries(critical)) {
      const n = Number(size)
      const at = wilcoxonSignedRank(atStatistic(n, bound).map((delta) => delta / 10)).pValue
      const above = wilcoxonSignedRank(atStatistic(n, bound + 1).map((delta) => delta / 10)).pValue
      ok(at <= 0.05, `n=${n}: p(W=${bound}) = ${at} should clear 0.05`)
      ok(above > 0.05, `n=${n}: p(W=${bound + 1}) = ${above} should miss 0.05`)
    }
  })

  it('reproduces the two-sided 0.01 critical values of the published table', () => {
    const critical = { 8: 0, 9: 1, 10: 3, 11: 5, 12: 7, 13: 9, 14: 12, 15: 15, 16: 19, 17: 23, 18: 27, 19: 32, 20: 37 }

    for (const [size, bound] of Object.entries(critical)) {
      const n = Number(size)
      const at = wilcoxonSignedRank(atStatistic(n, bound).map((delta) => delta / 10)).pValue
      const above = wilcoxonSignedRank(atStatistic(n, bound + 1).map((delta) => delta / 10)).pValue
      ok(at <= 0.01, `n=${n}: p(W=${bound}) = ${at} should clear 0.01`)
      ok(above > 0.01, `n=${n}: p(W=${bound + 1}) = ${above} should miss 0.01`)
    }
  })

  it('matches the exact tail probabilities quoted for n = 8', () => {
    // P(W <= 3) one-sided = 5/256, doubled = 0.0390625; W = 4 crosses alpha at
    // 7/256 doubled = 0.0546875. These are the values behind the n = 8 row of
    // the table above.
    close(wilcoxonSignedRank(atStatistic(8, 3).map((delta) => delta / 10)).pValue, 10 / 256)
    close(wilcoxonSignedRank(atStatistic(8, 4).map((delta) => delta / 10)).pValue, 14 / 256)
  })

  // --- the fast path against literal enumeration ----------------------------

  it('agrees with a brute-force enumeration of every sign assignment', () => {
    const cases = [
      [0.5],
      [0.1, -0.4],
      [0.2, 0.2, -0.7],
      [0.3, -0.3, 0.1, 0.9],
      [1, 2, 3, 4, 5, -6],
      [0.25, 0.25, 0.25, -0.25, 0.5, 0.75, -0.125],
      [-1, -2, -3, 4, 5, 6, 7, 8],
      [0.1, 0.1, 0.1, 0.1, 0.2, 0.2, -0.3, 0.4, -0.4, 0.5],
      [3, -1, 4, -1, 5, -9, 2, 6, 5, 3, 5],
    ]

    for (const deltas of cases) {
      close(wilcoxonSignedRank(deltas).pValue, bruteForcePValue(deltas), 1e-12)
    }
  })

  // --- the normal approximation ---------------------------------------------

  it('switches to the normal approximation past the exact ceiling', () => {
    strictEqual(wilcoxonSignedRank(sweep(WILCOXON_EXACT_MAX_N).map((rank) => rank / 10)).method, 'exact')
    strictEqual(wilcoxonSignedRank(sweep(WILCOXON_EXACT_MAX_N + 1).map((rank) => rank / 10)).method, 'normal')
  })

  it('lands the approximation close to the exact value at the boundary', () => {
    // Same data, one pair apart: the two methods must not disagree by more than
    // the sampling noise of one extra observation.
    const exact = wilcoxonSignedRank(atStatistic(20, 52).map((delta) => delta / 10))
    const approximate = wilcoxonSignedRank(atStatistic(21, 52).map((delta) => delta / 10))
    strictEqual(exact.method, 'exact')
    strictEqual(approximate.method, 'normal')
    ok(Math.abs(exact.pValue - approximate.pValue) < 0.02, `exact ${exact.pValue} vs normal ${approximate.pValue}`)
  })

  it('keeps the approximation a probability even at the centre of the distribution', () => {
    // W sitting on the mean makes the continuity-corrected z positive, which
    // would push 2 * Phi(z) past 1 if it were not clamped.
    const n = 24
    const balanced = atStatistic(n, (n * (n + 1)) / 4).map((delta) => delta / 10)
    const result = wilcoxonSignedRank(balanced)
    strictEqual(result.method, 'normal')
    strictEqual(result.pValue, 1)
  })
})
