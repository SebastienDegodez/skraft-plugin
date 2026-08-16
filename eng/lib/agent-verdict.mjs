// Statistics behind an agent-suite verdict.
//
// An agent suite is single-arm: a custom agent is dispatched and deterministic
// graders either hold or they do not. There is no baseline to compare against,
// so the sign test in `verdict.mjs` does not apply — the honest reading is a
// conformance tally. The verdict is nonetheless emitted in the shape the
// dashboard and the PR comment already read, so agent evidence lands on the
// same page as skill evidence without a second renderer.

/** Default location of an agent descriptor, from its id. */
export const agentSourcePath = (id) => `plugins/skraft-framework/agents/${id}.agent.md`

const unquote = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^['"](.*)['"]$/, '$1')

const round = (value, precision = 3) => {
  if (value == null || Number.isNaN(value)) return null
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

/**
 * Which agent each stimulus of an agent eval spec dispatches.
 *
 * A trial record carries the stimulus name but not the stimulus tags, so the
 * only place the agent identity survives is the spec itself. Read without a
 * YAML dependency, like the rest of `eng/`: walk the `stimuli:` block, remember
 * the current stimulus, and take the first `agent:` key under it — which is the
 * `tags.agent` the executor routes on, always declared before the graders.
 *
 * @param {string} specContent raw eval.yaml content
 * @returns {Map<string, string>} stimulus name → agent id
 */
export function agentByStimulus(specContent) {
  const mapping = new Map()
  let inStimuli = false
  let stimulusIndent = null
  let stimulus = null

  for (const line of String(specContent ?? '').split(/\r?\n/)) {
    if (/^stimuli:\s*$/.test(line)) {
      inStimuli = true
      continue
    }
    if (!inStimuli) continue
    // A column-zero key ends the stimuli block.
    if (/^\S/.test(line)) break

    const entry = /^(\s*)-\s+name:\s*(.+?)\s*$/.exec(line)
    if (entry) {
      const indent = entry[1].length
      stimulusIndent ??= indent
      if (indent === stimulusIndent) {
        stimulus = unquote(entry[2])
        continue
      }
    }

    const tag = /^\s*agent:\s*(\S+)\s*$/.exec(line)
    if (tag && stimulus && !mapping.has(stimulus)) mapping.set(stimulus, unquote(tag[1]))
  }

  return mapping
}

/**
 * Classify an agent suite's trials into one publishable verdict per agent.
 *
 * A verdict is only credible when every trial actually ran: an errored trial
 * proves nothing about the agent, so the suite is reported as inconclusive
 * rather than counted as a pass. A trial that ran and scored below the spec's
 * threshold is a conformance break — the agent no longer does what its suite
 * says it does — and is published as a regression.
 *
 * @param {object[]} records Vally JSONL records from one agent eval run
 * @param {{ agents: Map<string, string>, threshold?: number, sourcePath?: (id: string) => string }} options
 * @returns {object[]} verdicts, one per agent the suite exercised
 */
export function agentSuiteVerdicts(records, { agents, threshold = 1, sourcePath = agentSourcePath } = {}) {
  const trials = (records ?? []).filter((record) => record?.type === 'trial-result')

  const byAgent = new Map()
  for (const trial of trials) {
    const id = agents?.get(trial.stimulus)
    // A stimulus with no `tags.agent` names no subject: there is nothing to
    // attribute the result to, so it is left out rather than mis-attributed.
    if (!id) continue
    if (!byAgent.has(id)) byAgent.set(id, [])
    byAgent.get(id).push(trial)
  }

  return [...byAgent.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, agentTrials]) => verdictFor(id, agentTrials, threshold, sourcePath))
}

function verdictFor(id, trials, threshold, sourcePath) {
  const scoreOf = (trial) => Number(trial.gradeResult?.score ?? 0)
  const conforms = (trial) => trial.gradeResult?.passed === true || scoreOf(trial) >= threshold

  const trialCount = trials.length
  const erroredCount = trials.filter((trial) => trial.status !== 'success').length
  const ran = trials.filter((trial) => trial.status === 'success')
  const conforming = ran.filter(conforms).length
  const breaking = ran.length - conforming

  const conclusive = trialCount > 0 && erroredCount === 0
  const passed = conclusive && breaking === 0
  const regressed = conclusive && breaking > 0

  const scenarios = [...new Set(trials.map((trial) => trial.stimulus))].map((stimulus) => {
    const scenarioTrials = trials.filter((trial) => trial.stimulus === stimulus)
    return {
      scenarioName: stimulus ?? 'Unnamed scenario',
      meanScore: round(average(scenarioTrials.map(scoreOf))) ?? 0,
      trials: scenarioTrials.map((trial) => ({
        winner: conforms(trial) ? 'treatment' : 'baseline',
        magnitude: round(scoreOf(trial)),
        errored: trial.status !== 'success',
      })),
    }
  })

  return {
    subject: { kind: 'agent', name: id, path: sourcePath(id) },
    conclusive,
    // No sign test, so power is not a property of this verdict: deterministic
    // graders on a single trial already say whether the agent conformed.
    underpowered: false,
    passed,
    regressed,
    conformance: { threshold, conforming, breaking, trialCount },
    netWin: trialCount ? (conforming - breaking) / trialCount : 0,
    meanScore: round(average(trials.map(scoreOf))),
    trialCount,
    erroredCount,
    scenarios,
    reason: reasonFor({ conclusive, passed, trialCount, erroredCount, conforming, breaking, threshold }),
  }
}

const average = (values) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : null)

function reasonFor({ conclusive, passed, trialCount, erroredCount, conforming, breaking, threshold }) {
  if (!trialCount) return 'no trial was recorded'
  if (!conclusive) return `incomplete run (${erroredCount} of ${trialCount} trial(s) errored)`
  if (passed) return `conforms on every trial (${conforming}/${trialCount} at or above ${threshold})`
  return `broke conformance on ${breaking} of ${trialCount} trial(s) (threshold ${threshold})`
}
