import { normalizeMcpTarget, sameMcpScope } from './report-mcp-policy.mjs'

// Pure: which published receipts still belong to the confirmed reporting scope. Shared by
// the ReportPublication service (RunPipeline) and the report.mjs command.

export const isDestinationSelected = (preferences, destination) => (destination === 'pr'
  ? preferences.destinations.pr
  : preferences.destinations.issue !== 'none')

export const configuredTarget = (preferences, destination) => normalizeMcpTarget(preferences, destination,
  destination === 'pr' ? preferences.prNumber : preferences.issueNumber)

// The receipt's targets that match the confirmed scope of a still-selected destination.
export const scopedReceipt = (receipt, preferences, story, kind) => {
  if (receipt?.story !== story || receipt?.kind !== kind) return undefined
  const targets = {}
  for (const destination of ['pr', 'issue']) {
    const entry = receipt.targets?.[destination]
    if (!entry || !isDestinationSelected(preferences, destination)) continue
    const number = destination === 'pr' ? preferences.prNumber : preferences.issueNumber
    if (number !== null && sameMcpScope(entry.target, configuredTarget(preferences, destination))) {
      targets[destination] = entry
    }
  }
  return { story, kind, targets }
}
