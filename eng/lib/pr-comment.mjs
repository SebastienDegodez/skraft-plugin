// Pure rules behind the pre-merge PR comment: which verdicts to show, how to
// format them, and whether any of them should block the merge.
//
// Reuses the same verdict/metrics fields the dashboard already renders
// (eng/lib/verdict.mjs, eng/lib/vally-metrics.mjs) — this module only adds a
// markdown table, it computes nothing new.
import { verdictState } from './verdict.mjs'

// The legend answers "what is p" inline, but a reader who wants the mechanism —
// why ties are discarded, why six decisive pairs is a hard floor, why a skill can
// win by a wide margin and still fail the sign test — needs more than a PR
// comment can hold without burying the table it is meant to explain.
const DOCS = 'https://sebastiendegodez.github.io/skraft-plugin'
const DEEP_DIVE =
  '📐 **Full explanation, with worked numbers:** ' +
  `[🇫🇷 Lire un verdict d'évaluation](${DOCS}/fr/explanation/deep-dive/lire-un-verdict.html) · ` +
  `[🇬🇧 Reading an evaluation verdict](${DOCS}/en/explanation/deep-dive/reading-a-verdict.html)`

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

const compactTokens = (value) => {
  if (value == null) return null
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k tok` : `${value} tok`
}

const compactDuration = (ms) => {
  if (ms == null) return null
  const seconds = Math.round(ms / 1000)
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`
}

// Absolute medians, not a delta: a single-arm suite has nothing to price
// against. What this answers is "what does one run of this agent cost" — the
// number that decides whether a suite fits the pre-merge budget at all.
const agentCostCell = (verdict) => {
  const efficiency = verdict.efficiency
  if (!efficiency) return '—'
  const parts = [compactTokens(efficiency.tokens), compactDuration(efficiency.durationMs)].filter(Boolean)
  return parts.length ? parts.join(' · ') : '—'
}

// The two tables report different instruments, and the difference is easy to
// miss: one is a paired comparison with a p-value, the other a single-arm
// conformance tally with no comparison in it at all. Collapsed so the comment
// stays skimmable, spelled out so a reader never has to guess what `p` means —
// the most common misreading is treating it as "the chance the skill works".
const SKILL_LEGEND = [
  '<details>',
  '<summary><b>How to read this table</b></summary>',
  '',
  '**The design.** Every stimulus runs twice on the same input: once with no skill mounted at all',
  '(*baseline*), once with only this skill mounted (*skilled*). Nothing else differs. Pairing the two',
  'run by run cancels most of the model\'s own variance, so what is left is attributable to the skill.',
  '',
  '| Column | What it says |',
  '| --- | --- |',
  '| **Verdict** | `✅ pass` credible improvement · `🔴 regression` credible harm, the only state that blocks the merge · `➖ no improvement` measured, nothing found · `⚪ inconclusive` the run could not decide — trials errored, went unmatched, or the budget was too small |',
  '| **Graders (base → skilled)** | Mean deterministic grader score on each arm over the pairs that counted, and the delta. The *size* of the effect, not only its direction. |',
  '| **Sign test** | Wins/Ties/Losses across paired runs, with its p-value. Asks **how often** the skilled arm won. |',
  '| **Rank test** | Wilcoxon signed-rank p-value. Asks **by how much** — one pair improving by 0.40 outweighs three improving by 0.02. Blank when only the LLM judge labelled a winner, since a rank test needs a magnitude per pair. |',
  '| **Efficiency Δ** | Token and wall-time cost of the skilled arm against baseline. Reported, never gated. |',
  '',
  '#### What is `p`?',
  '',
  '`p` is the probability of seeing a result **at least this lopsided if the skill changed nothing at',
  'all**. It is not the probability that the skill works, and `1 − p` is not a confidence level.',
  '',
  'The sign test discards every tied pair — a tie carries no information about direction — and keeps',
  'only the pairs that went one way or the other (the *discordant* pairs). If the skill did nothing,',
  'each of those is a coin flip, so `p` is the exact two-sided binomial probability of a split this',
  'extreme from a fair coin. The alpha is 0.05.',
  '',
  '| Discordant pairs | All in one direction | `p` | |',
  '| --- | --- | --- | --- |',
  '| 6 | 6W/0L | 0.031 | ✅ below alpha |',
  '| 5 | 5W/0L | 0.062 | ❌ above it |',
  '',
  'That is why a comparison with fewer than 6 discordant pairs is reported `⚪ inconclusive` rather',
  'than `➖ no improvement`: **no tally that small can reach significance, however one-sided it is.**',
  'Calling it "no improvement" would blame the skill for a trial budget that could never have',
  'concluded in either direction. An all-tie comparison is exempt — zero discordant pairs is a genuine',
  'no-difference measurement, not a power failure.',
  '',
  '**Why both tests must clear.** They ask different questions, and a verdict is credible only when',
  'they agree. Requiring agreement rather than either alone stops two shots at the same question from',
  'doubling the false-positive rate on the field that gates a merge.',
  '',
  '**Notes above the table** qualify a row without belonging in a column: pairs dropped because the',
  'skill never loaded (a baseline-versus-baseline pair measures nothing), where the ties landed — a tie',
  '*at the ceiling* means the baseline already scored full marks, so that stimulus cannot discriminate',
  'no matter how good the skill is — and whether the LLM judge read the same runs differently.',
  '',
  'Each spec budgets its own trials through `defaults.runs`; see `docs/skill-evaluation.md`.',
  '',
  DEEP_DIVE,
  '',
  '</details>',
]

const AGENT_LEGEND = [
  '<details>',
  '<summary><b>How to read this table</b></summary>',
  '',
  '**A different instrument — there is no `p` here.** An agent suite dispatches the real agent once per',
  'trial and grades the resulting trajectory. There is **no baseline arm**, so there is no pairing, no',
  'sign test and no p-value: nothing in this table is a comparison. What it measures is *conformance* —',
  'did the agent load the skills it declares, keep its identity, produce the expected handoff shape,',
  'refuse what it is required to refuse.',
  '',
  '| Column | What it says |',
  '| --- | --- |',
  '| **Verdict** | Whether the suite met its own `scoring.threshold` |',
  '| **Score** | Mean trial score, with a 95% interval when one is available |',
  '| **Conforming trials** | How many trials met the threshold, out of how many ran. `2/3` with one trial *erroring* is not the same finding as `2/3` with three completing — the Reason column says which. |',
  '| **Cost (median)** | Tokens and wall time for one run of this agent. Absolute, not a delta — there is no baseline to price against. It is what decides whether a suite fits the pre-merge budget. |',
  '',
  '**Which check gave way.** `2/3` says a trial fell short, never *what* broke. The notes under the',
  'table name the graders that did not hold and on how many trials, and the per-scenario breakdown',
  'says whether one behaviour is broken (a scenario failing all its trials) or the agent is merely',
  'flaky (the same count spread across scenarios). Those two need opposite responses.',
  '',
  '**Advisory by design.** An agent verdict never blocks a merge: a suite runs a real agent making real',
  'tool calls, so one flaky or timed-out session would block an unrelated PR. Read it, do not gate on it.',
  '',
  DEEP_DIVE,
  '',
  '</details>',
]

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
    'Automated pre-merge comparison for the skill(s) this PR changed. Merge is only ' +
      'blocked by a credible `regression`.',
    '',
    ...SKILL_LEGEND,
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
    const idle = inertiaNote(verdict)
    if (idle) parts.push(idle)
    const judge = verdict.judgeTally
    const sign = verdict.signTest
    if (judge && sign?.source === 'graders' && (judge.wins !== sign.wins || judge.losses !== sign.losses)) {
      // `judgeTally` comes straight from the comparison report, which never
      // applies the inactivation exclusion the grader pairing does. When pairs
      // were dropped the two tallies are computed over different sets, so
      // "the same runs" would be a false statement — and a damaging one, since
      // the judge's extra pairs are baseline-versus-baseline and drag its tally
      // toward losses that say nothing about the skill.
      parts.push(
        verdict.inactivatedCount
          ? `the judge scored all ${judge.wins + judge.ties + judge.losses} pairs — including the ` +
            `${verdict.inactivatedCount} the graders dropped — as ${judge.wins}W/${judge.ties}T/${judge.losses}L, ` +
            'so it is not the same set'
          : `the judge read the same runs as ${judge.wins}W/${judge.ties}T/${judge.losses}L`
      )
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

/**
 * Flag an arm that behaved like its own control.
 *
 * Only raised when both instruments agree, and phrased as the question it
 * actually poses rather than as a verdict: a skill that loads and changes
 * nothing is a candidate for deletion, but only the reader knows whether it is
 * carrying an agent suite that would fall with it.
 */
function inertiaNote(verdict) {
  const inertia = verdict.inertia
  if (!inertia?.idle) return null

  const percent = (rate) => `${Math.round(rate * 100)}%`
  return (
    `no measured effect on either instrument (graders tied on ${percent(inertia.graderTieRate)} of pairs, ` +
    `the judge on ${percent(inertia.judgeTieRate)}) — the skill loaded and behaved like its own control`
  )
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
    return `| ${dash(verdict.subject?.name)} | ${BADGE[state] ?? state} | ${scoreCell(verdict)} | ${dash(conformance.conforming)}/${dash(verdict.trialCount)} | ${agentCostCell(verdict)} | ${dash(verdict.reason)} |`
  })

  return [
    '## Agent conformance',
    '',
    'The agent suite(s) this PR touched, dispatched for real and graded by ' +
      'deterministic checks (identity, skill loading, handoff shape).',
    '',
    ...AGENT_LEGEND,
    '',
    '| Agent | Verdict | Score | Conforming trials | Cost (median) | Reason |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    ...failingGraderNotes(verdicts),
    ...scenarioBreakdown(verdicts),
  ]
}

/**
 * The graders that did not hold, named, with how often.
 *
 * The single most useful line the run produces and the one the tally hides: a
 * suite reported at 79.9% because one path assertion moved is a stale test,
 * while the same 79.9% spread over six different graders is a broken agent.
 * A grader that held on every trial is left out — only what gave way is news.
 */
function failingGraderNotes(verdicts) {
  const notes = verdicts.flatMap((verdict) => {
    const broke = (verdict.graders ?? []).filter((grader) => grader.passed < grader.total)
    if (!broke.length) return []
    const described = broke
      .sort((left, right) => left.passed / left.total - right.passed / right.total)
      .map((grader) => `\`${grader.name}\` ${grader.passed}/${grader.total}`)
    return [`- **${dash(verdict.subject?.name)}** — did not hold: ${described.join(', ')}.`]
  })

  return notes.length ? ['', 'Which checks gave way:', '', ...notes] : []
}

/**
 * Per-stimulus conformance, collapsed.
 *
 * Complete rather than selective — a scenario at full marks is what proves the
 * failure is localised — but folded away so the summary table stays skimmable.
 */
function scenarioBreakdown(verdicts) {
  const sections = verdicts.flatMap((verdict) => {
    const scenarios = verdict.scenarios ?? []
    if (!scenarios.length) return []
    const rows = scenarios.map((scenario) => {
      const score = scenario.meanScore == null ? '—' : scenario.meanScore.toFixed(2)
      const errored = scenario.trials?.filter((trial) => trial.errored).length ?? 0
      const note = errored ? `${errored} errored` : ''
      return `| ${dash(scenario.scenarioName)} | ${dash(scenario.conforming)}/${dash(scenario.trialCount)} | ${score} | ${note} |`
    })
    return [
      `**${dash(verdict.subject?.name)}**`,
      '',
      '| Scenario | Conforming | Mean score | |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
    ]
  })

  if (!sections.length) return []
  return ['', '<details>', '<summary><b>Per-scenario breakdown</b></summary>', '', ...sections, '</details>']
}
