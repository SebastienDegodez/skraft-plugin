// Statistics behind a skill-versus-baseline verdict.
//
// Two instruments read the same pair of runs. The eval's own deterministic
// graders score each trial — that is the behaviour the eval author wrote down
// and the thing the skill is supposed to change. Vally's LLM judge reads the two
// trajectories side by side and calls a winner without ever seeing a grader
// result. The graders decide the verdict; the judge is published beside them as
// a second opinion (`judgeTally`), so a disagreement between the two is visible
// instead of being resolved silently by whichever one happened to be wired in.
//
// Turning a tally into "this skill helps" requires a significance test, not a
// headline percentage: with three trials, 2W/0T/1L is noise. Two tests run on
// the same pairs — the exact binomial sign test on the discordant pairs, which
// is assumption-free but blind to how big each win was, and the Wilcoxon
// signed-rank test on the score differences, which keeps the magnitudes.

import { pairTrials } from './paired-trials.mjs'
import { wilcoxonSignedRank } from './wilcoxon.mjs'

/**
 * Two-sided exact binomial sign test p-value for a wins/losses tally.
 *
 * The direction of the effect is chosen after seeing the data, so the tail is
 * doubled: a one-sided reading would be anti-conservative by a factor of two and
 * would let a coin flip look like a credible improvement.
 */
export function signTestPValue(wins, losses) {
  const discordant = wins + losses
  if (discordant === 0) return 1

  const favored = Math.max(wins, losses)
  let tail = 0
  for (let count = favored; count <= discordant; count += 1) tail += binomial(discordant, count)
  return Math.min(1, (2 * tail) / 2 ** discordant)
}

function binomial(n, k) {
  if (k < 0 || k > n) return 0
  let value = 1
  for (let index = 1; index <= k; index += 1) value = (value * (n - k + index)) / index
  return value
}

export const SIGN_TEST_ALPHA = 0.05
export const WILCOXON_ALPHA = 0.05
export const MIN_CREDIBLE_TRIALS = 5

// Tie rate at which a skill stops looking quiet and starts looking absent.
//
// Four in five pairs showing no difference on either instrument is not a
// borderline reading — it is the shape of an arm that behaved like its own
// control. Set lower, ordinary skills with a narrow remit trip it; set higher,
// nothing ever does and the signal is decorative.
export const INERT_TIE_RATE = 0.8

// Power lives in the discordant pairs, not in the trial count. The two-sided
// exact sign test bottoms out at p = 2 · 2^-d, so below six discordant pairs no
// tally can reach alpha: a flawless 5W/0L sweep scores p = 0.0625 and 7W/1L
// scores p = 0.070. Reporting those as "no improvement" blames the skill for a
// budget that could never have concluded in either direction, so they are
// inconclusive instead. An all-tie comparison is exempt: zero discordant pairs
// is a genuine no-difference measurement, not a power failure.
export const MIN_DISCORDANT_PAIRS = 6

/**
 * Classify a comparison into a publishable verdict.
 *
 * A verdict is only credible when the comparison is complete (no errored or
 * unmatched trials) and powered (enough trials to distinguish signal from
 * noise). Anything else is reported as inconclusive rather than silently
 * counted as a pass — no data is not a passing result.
 *
 * The subject is whatever was added on the treatment side: a skill made
 * available to a plain agent, or a custom agent dispatched instead of one. Both
 * need two arms. A single-arm agent suite has no baseline to test against;
 * `agent-verdict.mjs` classifies those.
 *
 * ## What `passed` requires
 *
 * Both tests, not either one. `passed` is the field that publishes a claim and
 * that (through `regression`) can block a merge, so the two p-values are
 * combined by intersection rather than union:
 *
 *  - **Alpha control.** Two tests aimed at one question, each at 0.05, give
 *    roughly two chances to clear the bar; a union rule quietly doubles the
 *    false-positive rate. An intersection keeps it at or under 0.05 without
 *    needing a multiplicity correction.
 *  - **Complementary blind spots.** The sign test discards magnitude but assumes
 *    nothing. Wilcoxon uses magnitude but assumes the differences are symmetric
 *    around the null median, and on a coarse rubric with a handful of pairs it
 *    can be carried by one or two large deltas. A result that survives both has
 *    survived both weaknesses.
 *  - **Nothing is hidden by the conservatism.** The Wilcoxon p-value is
 *    published in the verdict and named in `reason`, so the case the sign test
 *    is bad at — few pairs, large deltas — is visible to a reader even though it
 *    does not auto-certify. The brief was to add a test beside the sign test,
 *    not to replace it.
 *
 * When no per-trial records are supplied there are no differences to rank, the
 * Wilcoxon clause is vacuous, and the historical sign-test-only rule stands.
 *
 * @param {object} report Vally `compare` report
 * @param {{ kind: 'skill' | 'agent', name: string, path: string }} subject what was under test
 * @param {{ baselineRecords: object[], skilledRecords: object[] }} [trials] raw records of both arms;
 *   supplied, the deterministic graders decide the tally, and the judge becomes `judgeTally`
 */
export function comparisonVerdict(report, subject, trials) {
  const summary = report.summary ?? {}
  const judgeWins = summary.wins ?? 0
  const judgeTies = summary.ties ?? 0
  const judgeLosses = summary.losses ?? 0
  const judgeTally = {
    wins: judgeWins,
    ties: judgeTies,
    losses: judgeLosses,
    discordant: judgeWins + judgeLosses,
    pValue: signTestPValue(judgeWins, judgeLosses),
    // The judge's own scoring of the treatment arm, kept with the tally it
    // produced so the two are never read as coming from different instruments.
    meanScore: summary.meanScore ?? 0,
    confidenceInterval: { low: summary.ciLow ?? null, high: summary.ciHigh ?? null, level: 0.95 },
    winRate: summary.winRate ?? null,
  }

  const pairing = trials ? pairTrials(trials.baselineRecords, trials.skilledRecords) : null
  const source = pairing ? 'graders' : 'judge'
  const wins = pairing ? pairing.wins : judgeWins
  const ties = pairing ? pairing.ties : judgeTies
  const losses = pairing ? pairing.losses : judgeLosses

  // A pair the skill never activated on measured a baseline against a baseline.
  // It leaves the tally and leaves the effective trial count with it.
  const inactivatedCount = pairing ? pairing.inactivatedCount : 0
  const trialCount = pairing ? wins + ties + losses : (summary.trialCount ?? wins + ties + losses)
  const pairedTrialCount = pairing ? pairing.pairs.length : trialCount

  const reportUnmatched = (report.unmatchedBaseline?.length ?? 0) + (report.unmatchedTreatment?.length ?? 0)
  // Two instruments count the same defect; take the louder one rather than
  // adding them, so a trial neither could place is counted once and a trial only
  // one of them noticed still forces the verdict open.
  const erroredCount = pairing ? Math.max(summary.erroredCount ?? 0, pairing.erroredCount) : (summary.erroredCount ?? 0)
  const unmatchedTrialCount = pairing ? Math.max(reportUnmatched, pairing.unmatchedCount) : reportUnmatched

  // Did the skill change anything at all, as opposed to changing something the
  // score could not resolve?
  //
  // A high grader tie rate on its own does not answer that. An LLM grader
  // returns one integer on a coarse scale, so a real change in method that
  // leaves the answer correct routinely lands in the same bucket. The judge is
  // what closes the gap: it reads both trajectories side by side and calls a
  // winner without ever seeing a grader result, so it is looking at how the
  // agent worked, not at what it scored. When both instruments call tie on
  // nearly every pair, the two arms were indistinguishable to a reader and not
  // merely to the rubric.
  //
  // That is the only evidence that can argue for deleting a skill rather than
  // fixing its eval, so it is published as two rates and a flag rather than
  // folded into the verdict — the decision is the reader's, and it belongs
  // beside the activation rate, which says whether the skill was there at all.
  const countedPairs = wins + ties + losses
  const judgeCounted = judgeWins + judgeTies + judgeLosses
  const graderTieRate = countedPairs ? ties / countedPairs : null
  const judgeTieRate = judgeCounted ? judgeTies / judgeCounted : null
  const inertia = {
    graderTieRate,
    judgeTieRate,
    threshold: INERT_TIE_RATE,
    idle:
      graderTieRate != null &&
      judgeTieRate != null &&
      graderTieRate >= INERT_TIE_RATE &&
      judgeTieRate >= INERT_TIE_RATE,
  }

  const discordant = wins + losses
  const pValue = signTestPValue(wins, losses)
  const wilcoxon = {
    ...wilcoxonSignedRank(pairing?.deltas ?? []),
    alpha: WILCOXON_ALPHA,
    // The sign test still runs on a judge-only comparison; the rank test cannot,
    // because a winner label carries no magnitude to rank.
    available: Boolean(pairing),
  }

  // An inactivated pair is excluded from the tally but does NOT force the
  // verdict open, unlike an errored or unmatched one. The difference is what the
  // trial tells us: an errored run is the instrument breaking, so we cannot know
  // what would have happened, while a run where the skill never loaded is a
  // successful measurement — of the skill's reach, which `metrics.activation`
  // already reports — that simply does not belong in a treatment-vs-baseline
  // contrast. Forcing inconclusive would also throw away the valid pairs beside
  // it, and since real evals rarely activate on every stimulus, it would leave
  // most skills permanently unverdictable. What is left is a smaller n, and the
  // power gates below already refuse to conclude on a smaller n than they trust.
  const conclusive = erroredCount === 0 && unmatchedTrialCount === 0 && wins + ties + losses === trialCount
  const starved = discordant > 0 && discordant < MIN_DISCORDANT_PAIRS
  const underpowered = conclusive && (trialCount < MIN_CREDIBLE_TRIALS || starved)
  const credible =
    conclusive && !underpowered && pValue <= SIGN_TEST_ALPHA && (!wilcoxon.available || wilcoxon.pValue <= WILCOXON_ALPHA)
  const passed = credible && wins > losses
  const regressed = credible && losses > wins

  return {
    subject: { kind: subject.kind, name: subject.name, path: subject.path },
    conclusive,
    underpowered,
    minCredibleTrials: MIN_CREDIBLE_TRIALS,
    minDiscordantPairs: MIN_DISCORDANT_PAIRS,
    passed,
    regressed,
    netWin: trialCount ? (wins - losses) / trialCount : 0,
    signTest: { wins, ties, losses, discordant, pValue, alpha: SIGN_TEST_ALPHA, source },
    wilcoxon,
    judgeTally,
    // Kept at the top level for the dashboard and the PR comment, which have
    // read them here since before the graders drove the tally. Judge-sourced —
    // `judgeTally` holds the same three values with the tally they came with.
    meanScore: judgeTally.meanScore,
    confidenceInterval: judgeTally.confidenceInterval,
    winRate: judgeTally.winRate,
    graderScores: pairing
      ? { baselineMean: pairing.baselineMean, skilledMean: pairing.skilledMean, medianDelta: pairing.medianDelta }
      : null,
    // A tally is read as "the skill did nothing" long before anyone opens the
    // trajectories, and ties are the bulk of most tallies. Publishing where they
    // landed separates the two findings a bare `T` conflates: a stimulus the
    // baseline already aces, versus a difference the grader's resolution could
    // not hold.
    tieBreakdown: pairing?.tieBreakdown ?? null,
    inertia,
    graderPairs: pairing?.pairs ?? null,
    trialCount,
    pairedTrialCount,
    inactivatedCount,
    erroredCount,
    unmatchedTrialCount,
    scenarios: (report.stimuli ?? []).map((stimulus) => ({
      scenarioName: stimulus.stimulusName ?? 'Unnamed scenario',
      meanScore: stimulus.meanScore ?? 0,
      trials: (stimulus.trials ?? []).map((trial) => ({
        winner: trial.winner ?? 'tie',
        magnitude: trial.magnitude ?? null,
        errored: trial.errored ?? false,
      })),
    })),
    reason: verdictReason({
      conclusive,
      underpowered,
      starved,
      passed,
      regressed,
      wins,
      ties,
      losses,
      discordant,
      pValue,
      wilcoxon,
      erroredCount,
      unmatchedTrialCount,
      inactivatedCount,
      trialCount,
    }),
  }
}

/** Publishable state of a verdict, as rendered on the dashboard. */
export function verdictState(verdict) {
  if (verdict.conclusive === false || verdict.underpowered === true) return 'inconclusive'
  if (verdict.regressed === true) return 'regression'
  if (verdict.passed === true) return 'pass'
  return 'no-improvement'
}

function verdictReason({
  conclusive,
  underpowered,
  starved,
  passed,
  regressed,
  wins,
  ties,
  losses,
  discordant,
  pValue,
  wilcoxon,
  erroredCount,
  unmatchedTrialCount,
  inactivatedCount,
  trialCount,
}) {
  const tally = `${wins}W/${ties}T/${losses}L`
  const significance = wilcoxon?.available
    ? `sign test p=${pValue.toFixed(3)}, Wilcoxon p=${wilcoxon.pValue.toFixed(3)}`
    : `sign test p=${pValue.toFixed(3)}`
  // Always appended, never swallowed: a verdict computed on a reduced n has to
  // say so on its face, whatever else it concluded.
  const excluded = inactivatedCount
    ? ` [${inactivatedCount} pair(s) excluded: the skill never activated on the skilled run]`
    : ''

  if (!conclusive) return `incomplete comparison (${erroredCount} errored, ${unmatchedTrialCount} unmatched trial(s))${excluded}`
  if (trialCount === 0 && inactivatedCount) {
    return `nothing was measured: the skill activated on none of the ${inactivatedCount} skilled run(s), so every pair was a baseline against a baseline`
  }
  if (underpowered && trialCount < MIN_CREDIBLE_TRIALS) {
    return `underpowered (${trialCount} trial(s); a credible verdict needs at least ${MIN_CREDIBLE_TRIALS})${excluded}`
  }
  if (starved) {
    return `underpowered (${tally}: ${discordant} discordant pair(s); no tally below ${MIN_DISCORDANT_PAIRS} can reach p<=${SIGN_TEST_ALPHA}, so budget more runs)${excluded}`
  }
  if (passed) return `credibly better (${tally}, ${significance})${excluded}`
  if (regressed) return `credibly worse (${tally}, ${significance})${excluded}`
  return `no credible improvement (${tally}, ${significance})${excluded}`
}
