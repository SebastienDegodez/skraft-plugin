// Pure: the DESIGN ADR ratification checkpoint (skraft-orchestrator.md "ADR
// ratification"). Reads docs/adr/decisions-index.md rows and the human's answer.

const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim())

// Rows of the decisions index whose Status is Proposed: { adr, title }.
export const proposedAdrs = (indexContent) => {
  if (typeof indexContent !== 'string') return []
  const lines = indexContent.split(/\r?\n/).filter((line) => line.trim().startsWith('|'))
  if (lines.length < 2) return []
  const header = cells(lines[0]).map((cell) => cell.toLowerCase())
  const adrAt = header.indexOf('adr')
  const titleAt = header.indexOf('title')
  const statusAt = header.indexOf('status')
  if (adrAt < 0 || statusAt < 0) return []
  return lines.slice(2)
    .map(cells)
    .filter((row) => (row[statusAt] ?? '').toLowerCase() === 'proposed')
    .map((row) => Object.freeze({ adr: row[adrAt], title: titleAt >= 0 ? row[titleAt] : '' }))
}

export const ratificationQuestion = (pending) => [
  `DESIGN is approved. ${pending.length} ADR(s) await your ratification:`,
  ...pending.map(({ adr, title }) => `- ADR-${adr} ${title}`),
  'Answer "accept all", "reject all", "pause", or per ADR: `<NNN> accept | reject | amend "<note>"`.',
].join('\n')

export const RATIFICATION_OPTIONS = Object.freeze(['accept all', 'reject all', 'pause'])

// The human's answer → what happens next.
//   { kind: 'pause' }                         — stop; the checkpoint stays open
//   { kind: 'ratify', verdicts: [{adr, verdict}], amendments: [{adr, note}] }
export const interpretRatification = (answer, pending) => {
  const text = String(answer ?? '').trim()
  const lower = text.toLowerCase()
  if (!text || lower === 'pause') return Object.freeze({ kind: 'pause' })
  if (lower === 'accept all' || lower === 'reject all') {
    const verdict = lower === 'accept all' ? 'Accepted' : 'Rejected'
    return Object.freeze({ kind: 'ratify', verdicts: pending.map(({ adr }) => ({ adr, verdict })), amendments: [] })
  }
  const verdicts = []
  const amendments = []
  for (const line of text.split(/[\n;]+/)) {
    const match = line.trim().match(/^(?:adr-?)?(\d+)\s+(accept|reject|amend)\b\s*(?:"([^"]*)")?/i)
    if (!match) continue
    const adr = match[1].padStart(3, '0')
    const action = match[2].toLowerCase()
    if (action === 'amend') amendments.push({ adr, note: match[3] ?? '' })
    else verdicts.push({ adr, verdict: action === 'accept' ? 'Accepted' : 'Rejected' })
  }
  if (verdicts.length === 0 && amendments.length === 0) return Object.freeze({ kind: 'pause' })
  return Object.freeze({ kind: 'ratify', verdicts, amendments })
}
