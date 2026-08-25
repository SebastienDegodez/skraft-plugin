// Wilcoxon signed-rank test on paired differences.
//
// The sign test in `verdict.mjs` answers "did the treatment win more often than
// it lost", and throws the size of every win away. Two wins worth +0.66 and
// +0.63 against a loss worth −0.03 read as 2-against-1 there — barely better
// than a coin flip — even though the treatment is plainly ahead. The Wilcoxon
// signed-rank test keeps the magnitudes: it ranks the differences by absolute
// size and asks whether the ranks that came out positive outweigh the ones that
// came out negative. It is still distribution-free; it only assumes the
// differences are symmetric around their median under the null.
//
// It is published beside the sign test, never instead of it — see the `passed`
// rule documented in `verdict.mjs`.

/**
 * Largest sample for which the exact null distribution is computed.
 *
 * Above this the enumeration is still cheap, but the normal approximation is
 * already accurate to well past the third decimal a p-value is reported to.
 */
export const WILCOXON_EXACT_MAX_N = 20

/**
 * Mid-ranks of the absolute differences.
 *
 * Ties share the average of the ranks they span, which is what makes the
 * statistic well defined on a coarse grading rubric where identical deltas are
 * common. Returned doubled so every rank is an integer: the average of the
 * consecutive ranks i..j is (i + j) / 2, so twice it is always i + j.
 *
 * @param {number[]} magnitudes absolute differences, all strictly positive
 * @returns {{ doubledRanks: number[], tieGroupSizes: number[] }}
 */
export function doubledMidRanks(magnitudes) {
  const order = magnitudes.map((value, index) => index).sort((left, right) => magnitudes[left] - magnitudes[right])
  const doubledRanks = new Array(magnitudes.length)
  const tieGroupSizes = []

  let start = 0
  while (start < order.length) {
    let end = start
    while (end + 1 < order.length && magnitudes[order[end + 1]] === magnitudes[order[start]]) end += 1
    // Ranks are 1-based, so the group spans ranks start+1 .. end+1.
    const doubled = start + 1 + end + 1
    for (let index = start; index <= end; index += 1) doubledRanks[order[index]] = doubled
    if (end > start) tieGroupSizes.push(end - start + 1)
    start = end + 1
  }

  return { doubledRanks, tieGroupSizes }
}

/**
 * Exact two-sided p-value by enumerating every sign assignment.
 *
 * Under the null each difference is equally likely to have come out positive or
 * negative, so the 2^n sign assignments of the observed rank vector are equally
 * likely. Rather than materialising them, the same distribution is accumulated
 * by dynamic programming over the reachable rank sums — identical counts, linear
 * in n instead of exponential, and it handles tied mid-ranks without a
 * correction term because the ranks themselves are what gets enumerated.
 *
 * The two-sided region is taken as a union, not as twice one tail: when the
 * statistic sits exactly at the centre the two tails are the same set, and
 * doubling would report p = 2.
 */
function exactPValue(doubledRanks, doubledStatistic) {
  const total = doubledRanks.reduce((sum, rank) => sum + rank, 0)
  let counts = new Float64Array(total + 1)
  counts[0] = 1
  let reach = 0

  for (const rank of doubledRanks) {
    const next = new Float64Array(total + 1)
    for (let sum = 0; sum <= reach; sum += 1) {
      const count = counts[sum]
      if (!count) continue
      next[sum] += count // this difference came out negative: contributes nothing to W+
      next[sum + rank] += count // ... or positive
    }
    reach += rank
    counts = next
  }

  const upper = total - doubledStatistic
  let extreme = 0
  for (let sum = 0; sum <= total; sum += 1) {
    if (sum <= doubledStatistic || sum >= upper) extreme += counts[sum]
  }
  return Math.min(1, extreme / 2 ** doubledRanks.length)
}

/** Standard normal CDF — Abramowitz & Stegun 7.1.26 on erf, |error| < 1.5e-7. */
function standardNormalCdf(z) {
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * erf)
}

/**
 * Two-sided normal approximation with a continuity correction.
 *
 * The statistic is the smaller of the two rank sums, so it sits at or below the
 * mean and the half-step correction is added, not subtracted. Tied mid-ranks
 * shrink the null variance, hence the usual sum-of-(t^3 - t) term.
 */
function normalPValue(n, statistic, tieGroupSizes) {
  const mean = (n * (n + 1)) / 4
  const tieCorrection = tieGroupSizes.reduce((sum, size) => sum + (size ** 3 - size), 0) / 48
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorrection
  if (variance <= 0) return 1
  return Math.min(1, 2 * standardNormalCdf((statistic - mean + 0.5) / Math.sqrt(variance)))
}

/**
 * Wilcoxon signed-rank test on a list of paired differences.
 *
 * Zero differences are dropped before ranking (Wilcoxon's own exclusion rule):
 * a pair the graders scored identically carries no direction, and keeping it
 * would inflate n with observations that cannot discriminate.
 *
 * @param {number[]} deltas treatment score minus baseline score, one per pair
 * @returns {{ n: number, zeroCount: number, statistic: number|null, positiveRankSum: number|null,
 *             negativeRankSum: number|null, pValue: number, method: 'exact'|'normal'|'degenerate' }}
 */
export function wilcoxonSignedRank(deltas) {
  const values = (deltas ?? []).filter((delta) => Number.isFinite(delta))
  const nonZero = values.filter((delta) => delta !== 0)
  const zeroCount = values.length - nonZero.length

  if (nonZero.length === 0) {
    // Every pair tied (or there were none). No ranking is possible, and "no
    // difference at all" is the null, so the test cannot reject it.
    return { n: 0, zeroCount, statistic: null, positiveRankSum: null, negativeRankSum: null, pValue: 1, method: 'degenerate' }
  }

  const n = nonZero.length
  const { doubledRanks, tieGroupSizes } = doubledMidRanks(nonZero.map(Math.abs))

  let doubledPositive = 0
  for (let index = 0; index < n; index += 1) if (nonZero[index] > 0) doubledPositive += doubledRanks[index]
  const doubledTotal = doubledRanks.reduce((sum, rank) => sum + rank, 0)
  const doubledNegative = doubledTotal - doubledPositive
  const doubledStatistic = Math.min(doubledPositive, doubledNegative)

  const method = n <= WILCOXON_EXACT_MAX_N ? 'exact' : 'normal'
  const pValue =
    method === 'exact' ? exactPValue(doubledRanks, doubledStatistic) : normalPValue(n, doubledStatistic / 2, tieGroupSizes)

  return {
    n,
    zeroCount,
    statistic: doubledStatistic / 2,
    positiveRankSum: doubledPositive / 2,
    negativeRankSum: doubledNegative / 2,
    pValue,
    method,
  }
}
