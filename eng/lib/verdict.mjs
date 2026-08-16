// Statistics behind a skill-versus-baseline verdict.
//
// Vally judges each trial and reports wins / ties / losses for the skilled
// variant against the baseline. Turning that tally into "this skill helps"
// requires a significance test, not a headline percentage: with three trials,
// 2W/0T/1L is noise. The exact binomial sign test on the discordant pairs is
// the standard, assumption-free answer.

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
export const MIN_CREDIBLE_TRIALS = 5

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
 * @param {object} report Vally `compare` report
 * @param {{ kind: 'skill' | 'agent', name: string, path: string }} subject what was under test
 */
export function comparisonVerdict(report, subject) {
  const summary = report.summary ?? {}
  const wins = summary.wins ?? 0
  const ties = summary.ties ?? 0
  const losses = summary.losses ?? 0
  const trialCount = summary.trialCount ?? wins + ties + losses
  const erroredCount = summary.erroredCount ?? 0
  const unmatchedTrialCount = (report.unmatchedBaseline?.length ?? 0) + (report.unmatchedTreatment?.length ?? 0)
  const discordant = wins + losses
  const pValue = signTestPValue(wins, losses)

  const conclusive = erroredCount === 0 && unmatchedTrialCount === 0 && wins + ties + losses === trialCount
  const starved = discordant > 0 && discordant < MIN_DISCORDANT_PAIRS
  const underpowered = conclusive && (trialCount < MIN_CREDIBLE_TRIALS || starved)
  const credible = conclusive && !underpowered && pValue <= SIGN_TEST_ALPHA
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
    signTest: { wins, ties, losses, discordant, pValue, alpha: SIGN_TEST_ALPHA },
    meanScore: summary.meanScore ?? 0,
    confidenceInterval: { low: summary.ciLow ?? null, high: summary.ciHigh ?? null, level: 0.95 },
    winRate: summary.winRate ?? null,
    trialCount,
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
    reason: verdictReason({ conclusive, underpowered, starved, passed, regressed, wins, ties, losses, discordant, pValue, erroredCount, unmatchedTrialCount, trialCount }),
  }
}

/** Publishable state of a verdict, as rendered on the dashboard. */
export function verdictState(verdict) {
  if (verdict.conclusive === false || verdict.underpowered === true) return 'inconclusive'
  if (verdict.regressed === true) return 'regression'
  if (verdict.passed === true) return 'pass'
  return 'no-improvement'
}

function verdictReason({ conclusive, underpowered, starved, passed, regressed, wins, ties, losses, discordant, pValue, erroredCount, unmatchedTrialCount, trialCount }) {
  const tally = `${wins}W/${ties}T/${losses}L`
  const significance = `sign test p=${pValue.toFixed(3)}`
  if (!conclusive) return `incomplete comparison (${erroredCount} errored, ${unmatchedTrialCount} unmatched trial(s))`
  if (underpowered && trialCount < MIN_CREDIBLE_TRIALS) {
    return `underpowered (${trialCount} trial(s); a credible verdict needs at least ${MIN_CREDIBLE_TRIALS})`
  }
  if (starved) {
    return `underpowered (${tally}: ${discordant} discordant pair(s); no tally below ${MIN_DISCORDANT_PAIRS} can reach p<=${SIGN_TEST_ALPHA}, so budget more runs)`
  }
  if (passed) return `credibly better (${tally}, ${significance})`
  if (regressed) return `credibly worse (${tally}, ${significance})`
  return `no credible improvement (${tally}, ${significance})`
}
