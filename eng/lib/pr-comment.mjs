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

// The rank test needs a magnitude per pair, which only the grader scores carry.
// A judge-only comparison labels a winner and stops, so the cell stays empty
// rather than pretending the test ran.
const wilcoxonCell = (verdict) => {
  const wilcoxon = verdict.wilcoxon
  if (!wilcoxon?.available) return '—'
  return `p=${wilcoxon.pValue == null ? '—' : wilcoxon.pValue.toFixed(3)}`
}

// Baseline and treatment means over the pairs that actually counted, so a
// reviewer sees the size of the effect and not only its direction.
const graderCell = (verdict) => {
  const scores = verdict.graderScores
  if (!scores) return signedFixed(verdict.metrics?.quality?.delta)
  const delta = scores.skilledMean - scores.baselineMean
  return `${scores.baselineMean.toFixed(3)} → ${scores.skilledMean.toFixed(3)} (${signedFixed(delta)})`
}

const efficiencyCell = (verdict) => {
  const efficiency = verdict.metrics?.efficiency
  if (!efficiency) return '—'
  return `${percent(efficiency.tokenDeltaPercent)} tokens, ${percent(efficiency.durationDeltaPercent)} time`
}

/** Every skill verdict across one or more `results.json` payloads. */
export function extractVerdicts(results) {
  return (results ?? []).flatMap((result) => (result?.verdicts ?? []).filter((verdict) => verdict.subject?.kind === 'skill'))
}

/** Every agent-suite verdict across one or more `results.json` payloads. */
export function extractAgentVerdicts(results) {
  return (results ?? []).flatMap((result) => (result?.verdicts ?? []).filter((verdict) => verdict.subject?.kind === 'agent'))
}

/**
 * True only when a changed skill's verdict is a credible regression.
 *
 * Agent suites are deliberately excluded: they run a single trial of a real
 * agent, so one flaky session would block an unrelated merge. Their verdicts are
 * reported for the reviewer to read, not enforced.
 */
export function hasRegression(results) {
  return extractVerdicts(results).some((verdict) => verdictState(verdict) === 'regression')
}

/** Render the changed-skill and changed-agent verdicts as a PR-comment-ready markdown table. */
export function buildPrComment(results) {
  const verdicts = extractVerdicts(results)
  const agentVerdicts = extractAgentVerdicts(results)
  if (!verdicts.length && !agentVerdicts.length) {
    return [
      '## Skill evaluation — baseline vs skilled',
      '',
      'No verdict was produced for the skill(s) this PR changed.',
    ].join('\n')
  }

  return [...skillSection(verdicts), ...agentSection(agentVerdicts)].join('\n')
}

function skillSection(verdicts) {
  if (!verdicts.length) return []

  const rows = verdicts.map((verdict) => {
    const state = verdictState(verdict)
    return `| ${dash(verdict.subject?.name)} | ${BADGE[state] ?? state} | ${graderCell(verdict)} | ${signTestCell(verdict)} | ${wilcoxonCell(verdict)} | ${efficiencyCell(verdict)} | ${dash(verdict.reason)} |`
  })

  return [
    '## Skill evaluation — baseline vs skilled',
    '',
    'Automated pre-merge comparison for the skill(s) this PR changed. Each spec ' +
      'budgets its own trials through `defaults.runs`; a verdict stays `inconclusive` ' +
      'below 5 trials — see `docs/skill-evaluation.md`. Merge is only blocked by a ' +
      'credible `regression`.',
    '',
    'Both tests read the deterministic grader scores, and both must clear their ' +
      'alpha before a verdict is credible: the sign test asks whether the treatment ' +
      'wins more often, the rank test whether it wins by enough. Agreement is ' +
      'required rather than either alone, so two shots at the same question cannot ' +
      'double the false-positive rate on the field that gates a merge.',
    '',
    '| Skill | Verdict | Graders (base → skilled) | Sign test | Rank test | Efficiency Δ | Reason |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    ...caveats(verdicts),
    '',
  ]
}

/**
 * Facts that change how a row should be read but do not belong in a column.
 *
 * A null result measured at 67% activation is not the same finding as a null
 * result where the skill loaded every time, and a tally the judge scored
 * differently is worth a second look before anyone trusts the badge.
 */
function caveats(verdicts) {
  const notes = verdicts.flatMap((verdict) => {
    const parts = []
    if (verdict.inactivatedCount) {
      parts.push(`${verdict.inactivatedCount} pair(s) left out of the tally — the skill never loaded on the treatment side`)
    }
    const silent = neverActivatedStimuli(verdict)
    // Naming them turns an unactionable count into the next thing to fix: a
    // stimulus that never loads the skill is a gap between what the eval asks
    // for and what the skill's description says it is for.
    if (silent.length) parts.push(`never loaded on ${silent.join(', ')}`)
    const rate = verdict.metrics?.activation?.rate
    if (rate != null && rate < 1) parts.push(`loaded on ${Math.round(rate * 100)}% of the runs that expected it`)
    const ties = tieNote(verdict)
    if (ties) parts.push(ties)
    const judge = verdict.judgeTally
    const sign = verdict.signTest
    if (judge && sign?.source === 'graders' && (judge.wins !== sign.wins || judge.losses !== sign.losses)) {
      parts.push(`the judge read the same runs as ${judge.wins}W/${judge.ties}T/${judge.losses}L`)
    }
    return parts.length ? [`- **${dash(verdict.subject?.name)}** — ${parts.join('; ')}.`] : []
  })

  return notes.length ? ['', 'Before reading the table:', '', ...notes] : []
}

/**
 * Stimuli where the skill loaded on none of their trials, as `name (0/n)`.
 *
 * Grouped rather than listed per trial: non-activation is a property of the
 * stimulus wording, so the same stimulus failing on every one of its runs is one
 * finding, not n of them. A stimulus that loaded at least once is left out — it
 * activates, just not reliably, and `activation.rate` already carries that.
 */
function neverActivatedStimuli(verdict) {
  const counts = new Map()
  for (const pair of verdict.graderPairs ?? []) {
    const name = pair?.stimulus
    if (name == null) continue
    const seen = counts.get(name) ?? { total: 0, inactivated: 0 }
    seen.total += 1
    if (pair.outcome === 'inactivated') seen.inactivated += 1
    counts.set(name, seen)
  }

  return [...counts]
    .filter(([, seen]) => seen.inactivated === seen.total)
    .map(([name, seen]) => `${name} (0/${seen.total})`)
}

/** Where the ties landed, when there are ties and the split is known. */
function tieNote(verdict) {
  const breakdown = verdict.tieBreakdown
  if (!breakdown) return null

  const described = [
    breakdown.ceiling ? `${breakdown.ceiling} at the ceiling — the baseline already scored full marks` : null,
    breakdown.middle ? `${breakdown.middle} in the same grader bucket` : null,
    breakdown.floor ? `${breakdown.floor} at the floor — neither arm scored` : null,
  ].filter(Boolean)

  return described.length ? `ties: ${described.join(', ')}` : null
}

function agentSection(verdicts) {
  if (!verdicts.length) return []

  const rows = verdicts.map((verdict) => {
    const state = verdictState(verdict)
    const conformance = verdict.conformance ?? {}
    return `| ${dash(verdict.subject?.name)} | ${BADGE[state] ?? state} | ${scoreCell(verdict)} | ${dash(conformance.conforming)}/${dash(verdict.trialCount)} | ${dash(verdict.reason)} |`
  })

  return [
    '## Agent conformance',
    '',
    'The agent suite(s) this PR touched, dispatched for real and graded by ' +
      'deterministic checks (identity, skill loading, handoff shape). Single-arm, so ' +
      'there is no baseline and no sign test. Advisory: an agent verdict never blocks ' +
      'the merge.',
    '',
    '| Agent | Verdict | Score | Conforming trials | Reason |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ]
}
