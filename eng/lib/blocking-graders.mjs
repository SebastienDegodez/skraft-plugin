// Which grader actually stops the treated arm, and how narrowly.
//
// A pass/fail mark answers "did every grader pass" and nothing else, so a trial
// that missed one grader and a trial that missed six read identically. That is
// the difference between an arm that nearly did the work and one that never
// started, and it is exactly the difference a reader needs in order to decide
// what to fix next.
//
// This is reporting, not scoring. Nothing here feeds the verdict: the paired
// comparison ranks continuous grader scores and never consults a threshold.

// The activation grader answers "was the skill there", not "did the work land".
// It belongs to the pairing rules, not to the list of things to go fix.
const isActivationGrader = (detail) =>
  detail?.kind === 'skill-invocation' || /skill under test/i.test(String(detail?.name ?? ''))

const gradedTrialsOf = (records) =>
  (records ?? []).filter(
    (record) =>
      (record?.type == null || record.type === 'trial-result') &&
      (record?.status == null || record.status === 'success') &&
      Array.isArray(record?.gradeResult?.details),
  )

/**
 * Rank the graders that failed on an arm, and count how many trials were one
 * grader away from a clean sweep.
 *
 * @param {object[]} records Vally JSONL records for a single arm
 * @returns {{gradedTrials: number, cleanSweeps: number, nearMisses: number,
 *            byGrader: {name: string, failedIn: number, soleBlockerIn: number}[]} | null}
 *          `null` when the arm produced no gradeable trial, so a caller can tell
 *          "nothing to report" apart from "nothing blocked".
 */
export function blockingGraders(records) {
  const trials = gradedTrialsOf(records)
  if (!trials.length) return null

  const failedIn = new Map()
  const soleBlockerIn = new Map()
  let cleanSweeps = 0
  let nearMisses = 0

  for (const trial of trials) {
    const scored = trial.gradeResult.details.filter((detail) => !isActivationGrader(detail))
    const failures = scored.filter((detail) => detail.passed === false)

    if (!failures.length) {
      cleanSweeps += 1
      continue
    }
    if (failures.length === 1) {
      nearMisses += 1
      const name = String(failures[0].name ?? failures[0].kind ?? 'unnamed')
      soleBlockerIn.set(name, (soleBlockerIn.get(name) ?? 0) + 1)
    }
    for (const failure of failures) {
      const name = String(failure.name ?? failure.kind ?? 'unnamed')
      failedIn.set(name, (failedIn.get(name) ?? 0) + 1)
    }
  }

  const byGrader = [...failedIn.entries()]
    .map(([name, count]) => ({ name, failedIn: count, soleBlockerIn: soleBlockerIn.get(name) ?? 0 }))
    // Sole blockers first: a grader that alone stops otherwise-clean trials is
    // the cheapest thing a reader can act on.
    .sort((a, b) => b.soleBlockerIn - a.soleBlockerIn || b.failedIn - a.failedIn || a.name.localeCompare(b.name))

  return { gradedTrials: trials.length, cleanSweeps, nearMisses, byGrader }
}

/** One console block, or `null` when there is nothing worth printing. */
export function renderBlockingGraders(summary, label) {
  if (!summary || !summary.byGrader.length) return null
  const lines = [
    `  ${label}: ${summary.cleanSweeps}/${summary.gradedTrials} trial(s) passed every grader; ` +
      `${summary.nearMisses} missed by exactly one.`,
  ]
  for (const grader of summary.byGrader.slice(0, 5)) {
    const sole = grader.soleBlockerIn ? `, sole blocker in ${grader.soleBlockerIn}` : ''
    lines.push(`    - ${grader.name}: failed in ${grader.failedIn}/${summary.gradedTrials}${sole}`)
  }
  const rest = summary.byGrader.length - 5
  if (rest > 0) lines.push(`    - (${rest} further grader(s) not listed)`)
  return lines.join('\n')
}
