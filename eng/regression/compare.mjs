// Pure: compare a v1 RunSummary (reference) with a v2 RunSummary (candidate).
//
// @typedef {'regression' | 'improvement' | 'same' | 'info'} Severity
// @typedef {{ criterion: string, v1: any, v2: any, severity: Severity }} Finding

export const DEFAULT_THRESHOLDS = Object.freeze({ durationPct: 25, costPct: 25 })

const NOT_APPROVED = new Set(['NEEDS_REWORK', 'REJECTED'])

const finding = (criterion, v1, v2, severity) => ({ criterion, v1, v2, severity })

const comparePhases = (a, b) => {
  const missing = a.phasesReached.filter((p) => !b.phasesReached.includes(p))
  const extra = b.phasesReached.filter((p) => !a.phasesReached.includes(p))
  const severity = missing.length > 0 ? 'regression' : extra.length > 0 ? 'improvement' : 'same'
  return [finding('phases', a.phasesReached, b.phasesReached, severity)]
}

const compareStatus = (a, b) => {
  if (a.status === b.status) return [finding('status', a.status, b.status, 'same')]
  if (a.status === 'completed') return [finding('status', a.status, b.status, 'regression')]
  if (b.status === 'completed') return [finding('status', a.status, b.status, 'improvement')]
  return [finding('status', a.status, b.status, 'info')]
}

const finalVerdict = (list) => (Array.isArray(list) && list.length > 0 ? list[list.length - 1] : null)

const compareVerdicts = (a, b) => {
  const phases = [...new Set([...Object.keys(a.verdicts), ...Object.keys(b.verdicts)])]
  return phases.map((phase) => {
    const v1 = finalVerdict(a.verdicts[phase])
    const v2 = finalVerdict(b.verdicts[phase])
    const criterion = `verdict ${phase}`
    if (v1 === v2) return finding(criterion, v1, v2, 'same')
    if (v1 === 'APPROVED' && (v2 === null || NOT_APPROVED.has(v2))) return finding(criterion, v1, v2, 'regression')
    if (v2 === 'APPROVED' && (v1 === null || NOT_APPROVED.has(v1))) return finding(criterion, v1, v2, 'improvement')
    return finding(criterion, v1, v2, 'info')
  })
}

const gateKey = (g) => `${g.component}/${g.gate}`

const compareGates = (a, b) => {
  const left = new Map(a.gates.map((g) => [gateKey(g), g.status]))
  const right = new Map(b.gates.map((g) => [gateKey(g), g.status]))
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort()
  return keys.map((key) => {
    const v1 = left.get(key) ?? null
    const v2 = right.get(key) ?? null
    const criterion = `gate ${key}`
    if (v1 === v2) return finding(criterion, v1, v2, 'same')
    if (v1 === 'pass' && v2 !== 'pass' && v2 !== 'not_applicable') return finding(criterion, v1, v2, 'regression')
    if (v2 === 'pass' && v1 === 'fail') return finding(criterion, v1, v2, 'improvement')
    return finding(criterion, v1, v2, 'info')
  })
}

const compareBudget = (criterion, v1, v2, pct) => {
  if (typeof v1 !== 'number' || typeof v2 !== 'number' || v1 <= 0) return finding(criterion, v1, v2, v1 === v2 ? 'same' : 'info')
  const delta = ((v2 - v1) / v1) * 100
  if (delta > pct) return finding(criterion, v1, v2, 'regression')
  if (delta < -pct) return finding(criterion, v1, v2, 'improvement')
  return finding(criterion, v1, v2, 'same')
}

const compareRetries = (a, b) => {
  const severity = b.retries > a.retries ? 'regression' : b.retries < a.retries ? 'improvement' : 'same'
  return [finding('retries', a.retries, b.retries, severity)]
}

// A new artefact is reported as info: writing more files is not better by itself.
const compareArtefacts = (a, b) => {
  const left = new Set(a.artefacts)
  const right = new Set(b.artefacts)
  return [...new Set([...left, ...right])].sort().map((path) => {
    const criterion = `artefact ${path}`
    if (left.has(path) && right.has(path)) return finding(criterion, true, true, 'same')
    if (left.has(path)) return finding(criterion, true, false, 'regression')
    return finding(criterion, false, true, 'info')
  })
}

/**
 * @param {import('./summary.mjs').RunSummary} v1
 * @param {import('./summary.mjs').RunSummary} v2
 * @param {Partial<typeof DEFAULT_THRESHOLDS>} [thresholds]
 * @returns {Finding[]}
 */
export const compareSummaries = (v1, v2, thresholds = {}) => {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds }
  return [
    ...compareStatus(v1, v2),
    ...comparePhases(v1, v2),
    ...compareVerdicts(v1, v2),
    ...compareGates(v1, v2),
    ...compareArtefacts(v1, v2),
    compareBudget('duration', v1.durationMs, v2.durationMs, t.durationPct),
    compareBudget('cost', v1.cost, v2.cost, t.costPct),
    ...compareRetries(v1, v2),
  ]
}
