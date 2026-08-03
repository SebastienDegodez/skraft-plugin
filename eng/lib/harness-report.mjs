// Read a skraft-test-harness verdict report as a comparison.
//
// The harness drives the real Copilot CLI twice per scenario — once with
// `--no-custom-instructions` (baseline) and once with `--plugin-dir` plus
// `--agent` (the custom agent under test) — and records which run won. That is
// the same paired comparison Vally produces for a skill, expressed differently.
//
// Translating it here means an agent verdict is decided by exactly the same
// statistics as a skill verdict: one sign test, one credibility bar, one
// dashboard.

import { comparisonVerdict } from './verdict.mjs'

/** Winner labels the harness emits, mapped to the treatment's point of view. */
const OUTCOME = { withskill: 'win', baseline: 'loss', tie: 'tie' }

/**
 * Tally a harness report's scenarios into a comparison summary.
 * @param {{ scenarios?: Array<{ name?: string, winner?: string }> }} report
 */
export function tallyHarnessReport(report) {
  const scenarios = report?.scenarios ?? []
  let wins = 0
  let ties = 0
  let losses = 0
  let unrecognised = 0

  for (const scenario of scenarios) {
    const outcome = OUTCOME[String(scenario?.winner ?? '').toLowerCase()]
    if (outcome === 'win') wins += 1
    else if (outcome === 'loss') losses += 1
    else if (outcome === 'tie') ties += 1
    // A winner the harness does not name is not silently counted as a tie:
    // it makes the comparison incomplete, which the verdict reports as such.
    else unrecognised += 1
  }

  return { wins, ties, losses, unrecognised, trialCount: scenarios.length }
}

/**
 * Turn a harness report into the same verdict shape a Vally comparison produces.
 * @param {object} report the harness JSON report
 * @param {{ kind: 'skill' | 'agent', name: string, path: string }} subject
 */
export function verdictFromHarnessReport(report, subject) {
  const { wins, ties, losses, unrecognised, trialCount } = tallyHarnessReport(report)

  return comparisonVerdict(
    {
      summary: { wins, ties, losses, trialCount, erroredCount: unrecognised },
      stimuli: (report?.scenarios ?? []).map((scenario) => ({
        stimulusName: scenario?.name ?? 'Unnamed scenario',
        trials: [{ winner: String(scenario?.winner ?? 'tie'), errored: !(String(scenario?.winner ?? '').toLowerCase() in OUTCOME) }],
      })),
    },
    subject,
  )
}

/** The model the harness ran the scenarios on, if it recorded one. */
export function harnessModel(report) {
  return (report?.scenarios ?? []).find((scenario) => scenario?.model)?.model ?? 'unknown'
}
