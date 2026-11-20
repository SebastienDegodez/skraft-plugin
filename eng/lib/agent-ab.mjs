// Two versions of one agent on one frozen suite: what changed in cost, time and quality.
//
// An agent suite is single-arm (see agent-verdict.mjs). Comparing two refs of the
// same agent is a different question: the stimulus, fixture, model and graders are
// held equal, only the descriptor and its skills differ. Trials of the two arms are
// independent draws, not pairs, so the comparison reads medians per stimulus and
// refuses to call a speed-up an improvement when quality moved down.

const TEST_COMMAND = /\b(?:dotnet\s+test|npm\s+(?:run\s+)?test|npx\s+vitest|vitest|pytest|jest|mvn\s+(?:-\S+\s+)*test|gradle\w*\s+test|go\s+test|stryker|dotnet\s+stryker)\b/

const round = (value, precision = 1) => {
  if (value == null || !Number.isFinite(value)) return null
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

const median = (values) => {
  const ordered = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right)
  if (!ordered.length) return null
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

const timeOf = (event) => {
  const value = new Date(event?.timestamp ?? NaN).getTime()
  return Number.isFinite(value) ? value : null
}

const commandOf = (call) => {
  const args = call?.data?.arguments
  if (typeof args === 'string') return args
  return String(args?.command ?? args?.cmd ?? args?.script ?? '')
}

const resultText = (result) => {
  const data = result?.data?.result
  if (data == null) return ''
  if (typeof data === 'string') return data
  if (typeof data.content === 'string') return data.content
  if (typeof data.detailedContent === 'string') return data.detailedContent
  return JSON.stringify(data)
}

/** Pairs every tool_call with its tool_result by (agentId, toolCallId). */
export function toolSpans(events = []) {
  const open = new Map()
  const spans = []
  for (const event of events) {
    const id = event?.data?.toolCallId
    if (id == null) continue
    const key = JSON.stringify([event.agentId ?? null, id])
    if (event.type === 'tool_call') open.set(key, event)
    if (event.type === 'tool_result' && open.has(key)) {
      const call = open.get(key)
      open.delete(key)
      const start = timeOf(call)
      const end = timeOf(event)
      spans.push({
        toolName: call.data?.toolName ?? 'unknown',
        command: commandOf(call),
        durationMs: start != null && end != null ? Math.max(0, end - start) : 0,
        outputChars: resultText(event).length,
      })
    }
  }
  return spans
}

const isTestRun = (span) => span.toolName === 'bash' && TEST_COMMAND.test(span.command)

/** Cost, time and quality of one trial-result record. */
export function trialProfile(record) {
  const metrics = record?.trajectory?.metrics ?? {}
  const usage = metrics.tokenUsage ?? {}
  const spans = toolSpans(record?.trajectory?.events)
  const tests = spans.filter(isTestRun)
  // The agent's work: first to last event of its session. The trial's own duration also holds
  // the workspace setup (restore) and the grading, the same in both arms.
  const trialMs = Number(record?.durationMs ?? 0)
  const durationMs = Number(metrics.wallTimeMs) > 0 ? Number(metrics.wallTimeMs) : trialMs
  const toolMs = spans.reduce((total, span) => total + span.durationMs, 0)
  return {
    stimulus: record?.stimulus ?? record?.trajectory?.stimulus?.name ?? 'unknown',
    score: Number(record?.gradeResult?.score ?? 0),
    passed: record?.gradeResult?.passed === true,
    errored: record?.status === 'error',
    durationMs,
    trialMs,
    toolMs,
    modelMs: Math.max(0, durationMs - toolMs),
    testRuns: tests.length,
    testMs: tests.reduce((total, span) => total + span.durationMs, 0),
    testOutputChars: tests.reduce((total, span) => total + span.outputChars, 0),
    inputTokens: Number(usage.inputTokens ?? 0),
    outputTokens: Number(usage.outputTokens ?? 0),
    cacheReadTokens: Number(usage.cacheReadTokens ?? 0),
    totalTokens: Number(usage.totalTokens ?? 0),
    costNanoAiu: usage.cost?.amount != null ? Number(usage.cost.amount) : null,
    turns: Number(metrics.turnCount ?? 0),
    toolCalls: Number(metrics.toolCallCount ?? spans.length),
  }
}

export const MEASURES = [
  'durationMs',
  'trialMs',
  'modelMs',
  'toolMs',
  'testMs',
  'testRuns',
  'testOutputChars',
  'totalTokens',
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'costNanoAiu',
  'turns',
  'toolCalls',
]

const summarize = (profiles) => {
  const summary = { trials: profiles.length }
  for (const measure of MEASURES) summary[measure] = median(profiles.map((profile) => profile[measure]))
  summary.score = median(profiles.map((profile) => profile.score))
  summary.passRate = profiles.length ? round(profiles.filter((profile) => profile.passed).length / profiles.length, 3) : null
  summary.errors = profiles.filter((profile) => profile.errored).length
  return summary
}

const percent = (control, candidate) =>
  control != null && candidate != null && control !== 0 ? round(((candidate - control) / control) * 100) : null

const trials = (records) => records.filter((record) => record?.type === 'trial-result')

/**
 * Compares a control arm and a candidate arm of the same agent suite.
 *
 * `qualityHeld` is false as soon as a stimulus loses median score or pass rate:
 * a faster agent that lands fewer behaviours is a regression, not a gain.
 *
 * @param {{ control: object[], candidate: object[] }} arms raw results.jsonl records
 */
export function compareAgentArms({ control, candidate }) {
  const byStimulus = (records) => {
    const groups = new Map()
    for (const profile of trials(records).map(trialProfile)) {
      groups.set(profile.stimulus, [...(groups.get(profile.stimulus) ?? []), profile])
    }
    return groups
  }
  const controlGroups = byStimulus(control)
  const candidateGroups = byStimulus(candidate)
  const names = [...new Set([...controlGroups.keys(), ...candidateGroups.keys()])].sort()

  const stimuli = names.map((name) => {
    const left = summarize(controlGroups.get(name) ?? [])
    const right = summarize(candidateGroups.get(name) ?? [])
    const delta = Object.fromEntries(MEASURES.map((measure) => [measure, percent(left[measure], right[measure])]))
    const qualityHeld =
      left.trials > 0 &&
      right.trials > 0 &&
      (right.score ?? 0) >= (left.score ?? 0) &&
      (right.passRate ?? 0) >= (left.passRate ?? 0)
    return { stimulus: name, control: left, candidate: right, deltaPercent: delta, qualityHeld }
  })

  const all = (records) => summarize(trials(records).map(trialProfile))
  const overallControl = all(control)
  const overallCandidate = all(candidate)
  const qualityHeld = stimuli.length > 0 && stimuli.every((entry) => entry.qualityHeld)
  const cheaper = (percent(overallControl.totalTokens, overallCandidate.totalTokens) ?? 0) < 0
  const faster = (percent(overallControl.durationMs, overallCandidate.durationMs) ?? 0) < 0

  return {
    verdict: !qualityHeld ? 'quality-regression' : cheaper || faster ? 'improved' : 'no-gain',
    underpowered: Math.min(overallControl.trials, overallCandidate.trials) < 5,
    overall: {
      control: overallControl,
      candidate: overallCandidate,
      deltaPercent: Object.fromEntries(MEASURES.map((measure) => [measure, percent(overallControl[measure], overallCandidate[measure])])),
      qualityHeld,
    },
    stimuli,
  }
}

const seconds = (ms) => (ms == null ? '—' : `${round(ms / 1000)} s`)
const plain = (value) => (value == null ? '—' : String(round(value, 0)))
const signed = (value) => (value == null ? '—' : `${value > 0 ? '+' : ''}${value} %`)

const ROWS = [
  ['Durée du travail de l’agent', 'durationMs', seconds],
  ['  dont modèle', 'modelMs', seconds],
  ['  dont outils', 'toolMs', seconds],
  ['  dont tests', 'testMs', seconds],
  ['Lancements de tests', 'testRuns', plain],
  ['Sortie de tests (car.)', 'testOutputChars', plain],
  ['Tokens', 'totalTokens', plain],
  ['  entrée', 'inputTokens', plain],
  ['  sortie', 'outputTokens', plain],
  ['  cache lu', 'cacheReadTokens', plain],
  ['Coût (nano-AIU)', 'costNanoAiu', plain],
  ['Tours', 'turns', plain],
  ['Appels d’outils', 'toolCalls', plain],
  ['Durée de l’essai (préparation et notation comprises)', 'trialMs', seconds],
  ['Score (médiane)', 'score', (value) => (value == null ? '—' : String(round(value, 3)))],
  ['Taux de réussite', 'passRate', (value) => (value == null ? '—' : `${round(value * 100, 0)} %`)],
]

/** Markdown report of a comparison, control on the left. */
export function renderAgentComparison(comparison, { controlRef = 'control', candidateRef = 'candidate' } = {}) {
  const { overall } = comparison
  const lines = [
    `## A/B agent — ${controlRef} → ${candidateRef}`,
    '',
    `**Verdict : ${comparison.verdict}**${comparison.underpowered ? ' (moins de 5 essais par bras : indicatif)' : ''}`,
    '',
    `| Mesure (médiane) | ${controlRef} | ${candidateRef} | Δ |`,
    '|---|---|---|---|',
    ...ROWS.map(([label, key, format]) =>
      `| ${label} | ${format(overall.control[key])} | ${format(overall.candidate[key])} | ${signed(overall.deltaPercent[key] ?? null)} |`),
    '',
    `Essais : ${overall.control.trials} / ${overall.candidate.trials} — erreurs : ${overall.control.errors} / ${overall.candidate.errors}`,
  ]
  for (const entry of comparison.stimuli) {
    lines.push('', `### ${entry.stimulus}${entry.qualityHeld ? '' : ' — qualité en baisse'}`, '')
    lines.push('| Mesure | Δ |', '|---|---|')
    for (const [label, key] of ROWS.slice(0, 14)) lines.push(`| ${label.trim()} | ${signed(entry.deltaPercent[key])} |`)
    lines.push(`| Score | ${round(entry.control.score, 3) ?? '—'} → ${round(entry.candidate.score, 3) ?? '—'} |`)
  }
  return `${lines.join('\n')}\n`
}
