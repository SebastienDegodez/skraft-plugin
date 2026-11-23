import { validateReportingPreferences } from '../domain/reporting-preferences.mjs'
import {
  normalizeMcpTarget, markReportBody, trustedMcpDigest, prPointerBody,
  validateMcpPacket, chooseMcpAction, attestMcpReadback,
} from '../domain/report-mcp-policy.mjs'

// Local protocol only. The host executes its discovered MCP operations separately.
export function preparePublication(input, { hashText }) {
  const validation = validateReportingPreferences(input?.preferences)
  if (!validation.ok) throw new Error(validation.error.reason)
  const { preferences, story, kind, destination, previousReceipt } = input
  if (!['pr', 'issue'].includes(destination) ||
      (destination === 'pr' ? !preferences.destinations.pr : preferences.destinations.issue === 'none')) {
    throw new Error('Publication requires a selected remote destination')
  }
  if (destination === 'pr' && (!input.currentBranch || input.currentBranch !== preferences.branch)) {
    throw new Error('Current branch differs from confirmed PR scope')
  }
  let marked = markReportBody(input.body, story, kind)
  const number = destination === 'pr' ? preferences.prNumber : preferences.issueNumber
  if (number === null) return { status: 'pending', reason: 'Confirmed target number is missing' }
  const target = normalizeMcpTarget(preferences, destination, number)
  if (destination === 'issue' && preferences.destinations.issue === 'link') {
    try {
      const prTarget = normalizeMcpTarget(preferences, 'pr', preferences.prNumber)
      marked = markReportBody(prPointerBody(previousReceipt, { story, kind, target: prTarget }), story, kind)
    } catch (error) {
      return { status: 'pending', reason: `PR pointer receipt: ${error.message}` }
    }
  }
  const packet = {
    status: 'ready', story, kind, destination, target, branch: preferences.branch,
    ...marked, digest: hashText(marked.body),
  }
  const previousDigest = trustedMcpDigest(previousReceipt, packet)
  if (previousDigest !== undefined) packet.previousDigest = previousDigest
  return packet
}

export function decidePublication(packet, observation, { hashText, priorDecision }) {
  try {
    validateMcpPacket(packet, hashText)
    return chooseMcpAction(packet, observation, hashText, priorDecision)
  } catch (error) {
    return { action: 'pending', reason: error.message }
  }
}

export function recordPublication(packet, decision, readback, { hashText }) {
  validateMcpPacket(packet, hashText)
  const entry = attestMcpReadback(packet, decision, readback)
  return { story: packet.story, kind: packet.kind, targets: { [packet.destination]: entry } }
}