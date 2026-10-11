// Pure: waivers, exit code and the Markdown table posted as a PR comment.
//
// @typedef {{ criterion: string, fixture: string, reason: string }} Waiver

const ORDER = { regression: 0, improvement: 1, info: 2, same: 3 }

/** @returns {Waiver[]} */
export const parseWaivers = (text) => {
  const raw = JSON.parse(text)
  if (!Array.isArray(raw)) throw new Error('regression-waivers.json must be an array of {criterion, fixture, reason}')
  return raw.map((w, i) => {
    for (const field of ['criterion', 'fixture', 'reason']) {
      if (typeof w?.[field] !== 'string' || w[field].trim() === '') {
        throw new Error(`regression-waivers.json entry ${i}: ${field} must be a non-empty string`)
      }
    }
    return { criterion: w.criterion, fixture: w.fixture, reason: w.reason.trim() }
  })
}

export const applyWaivers = (findings, { fixture, waivers = [] } = {}) =>
  findings.map((f) => {
    if (f.severity !== 'regression') return f
    const w = waivers.find((x) => x.fixture === fixture && x.criterion === f.criterion)
    return w ? { ...f, waiver: w.reason } : f
  })

const unwaived = (findings, opts) => applyWaivers(findings, opts).filter((f) => f.severity === 'regression' && !f.waiver)

export const exitCode = (findings, opts = {}) => (unwaived(findings, opts).length > 0 ? 1 : 0)

const escapeCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

const formatDuration = (ms) => {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

const formatValue = (criterion, v) => {
  if (v === null || v === undefined) return '—'
  if (criterion === 'duration' && typeof v === 'number') return formatDuration(v)
  if (criterion.startsWith('artefact ')) return v ? 'present' : 'missing'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  return String(v)
}

export const renderMarkdown = (findings, { fixture = 'unknown', waivers = [] } = {}) => {
  const rows = applyWaivers(findings, { fixture, waivers })
    .map((f, i) => ({ f, i }))
    .sort((a, b) => ORDER[a.f.severity] - ORDER[b.f.severity] || a.i - b.i)
    .map(({ f }) => {
      const result = f.waiver ? `${f.severity} (waived: ${f.waiver})` : f.severity
      return `| ${escapeCell(f.criterion)} | ${escapeCell(formatValue(f.criterion, f.v1))} | ${escapeCell(formatValue(f.criterion, f.v2))} | ${escapeCell(result)} |`
    })

  const open = unwaived(findings, { fixture, waivers }).length
  const count = (s) => findings.filter((f) => f.severity === s).length
  const headline = open > 0 ? `**${open} unwaived regression${open > 1 ? 's' : ''}.**` : '**No unwaived regression.**'

  return [
    `## v1 → v2 regression check — \`${fixture}\``,
    '',
    `${headline} ${count('regression')} regression(s), ${count('improvement')} improvement(s), ${count('info')} info, ${count('same')} unchanged.`,
    '',
    '| Criterion | v1 | v2 | Result |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}
