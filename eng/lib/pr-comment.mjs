// Pure rules behind the pre-merge PR comment: which verdicts to show, how to
// format them, and whether any of them should block the merge.
//
// Reuses the same verdict/metrics fields the dashboard already renders
// (eng/lib/verdict.mjs, eng/lib/vally-metrics.mjs) — this module only adds a
// markdown table, it computes nothing new.
import { verdictState } from './verdict.mjs'

const BADGE = {
  pass: '✅ pass',
  regression: '🔴 regression',
  'no-improvement': '➖ no improvement',
  inconclusive: '⚪ inconclusive',
}

const dash = (value) => (value == null ? '—' : value)

const signedFixed = (value, digits = 3) => (value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}`)

const percent = (value) => (value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`)

const scoreCell = (verdict) => {
  if (verdict.meanScore == null) return '—'
  const { low, high } = verdict.confidenceInterval ?? {}
  const interval = low == null || high == null ? '' : ` (${low.toFixed(2)}–${high.toFixed(2)})`
  return `${verdict.meanScore.toFixed(2)}${interval}`
}

const signTestCell = (verdict) => {
  const { wins, ties, losses, pValue } = verdict.signTest ?? {}
  if (wins == null) return '—'
  return `${wins}W/${ties}T/${losses}L (p=${pValue == null ? '—' : pValue.toFixed(3)})`
}

const qualityDeltaCell = (verdict) => signedFixed(verdict.metrics?.quality?.delta)

const efficiencyCell = (verdict) => {
  const efficiency = verdict.metrics?.efficiency
  if (!efficiency) return '—'
  return `${percent(efficiency.tokenDeltaPercent)} tokens, ${percent(efficiency.durationDeltaPercent)} time`
}

/** Every skill verdict across one or more `results.json` payloads. */
export function extractVerdicts(results) {
  return (results ?? []).flatMap((result) => (result?.verdicts ?? []).filter((verdict) => verdict.subject?.kind === 'skill'))
}

/** True only when a changed skill's verdict is a credible regression. */
export function hasRegression(results) {
  return extractVerdicts(results).some((verdict) => verdictState(verdict) === 'regression')
}

/** Render the changed-skill verdicts as a PR-comment-ready markdown table. */
export function buildPrComment(results) {
  const verdicts = extractVerdicts(results)
  if (!verdicts.length) {
    return [
      '## Skill evaluation — baseline vs skilled',
      '',
      'No verdict was produced for the skill(s) this PR changed.',
    ].join('\n')
  }

  const rows = verdicts.map((verdict) => {
    const state = verdictState(verdict)
    return `| ${dash(verdict.subject?.name)} | ${BADGE[state] ?? state} | ${scoreCell(verdict)} | ${signTestCell(verdict)} | ${qualityDeltaCell(verdict)} | ${efficiencyCell(verdict)} | ${dash(verdict.reason)} |`
  })

  return [
    '## Skill evaluation — baseline vs skilled',
    '',
    'Automated pre-merge comparison for the skill(s) this PR changed. One trial per ' +
      'stimulus (`RUNS=1`), so most verdicts are reported as `inconclusive` unless the eval ' +
      'spec budgets at least 5 trials — see `docs/skill-evaluation.md`. Merge is only ' +
      'blocked by a credible `regression`.',
    '',
    '| Skill | Verdict | Score (95% CI) | Sign test | Quality Δ | Efficiency Δ | Reason |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}
