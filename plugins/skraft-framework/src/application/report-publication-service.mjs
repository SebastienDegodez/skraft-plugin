import { preparePublication, decidePublication, recordPublication } from './report-publication-handoff.mjs'
import { isDestinationSelected, scopedReceipt } from '../domain/report-publication-scope.mjs'
import { PENDING_PATH, PUBLICATION_PATH, receiptPath } from '../domain/report-boundary-policy.mjs'

// Use case ReportPublication: one rendered report to its confirmed remote destinations,
// in the host publication lifecycle (assets/reporting/mcp-publication.md):
//   prepare (local) → observe (transport) → decide (local) → write + fresh readback
//   (transport) → record (local), PR first, then the issue (its link needs the PR receipt).
// Every failure leaves the destination pending with its reason; engineering is never
// reopened for a publication. Ports: TrackingStore (packet, decision, receipts — the files
// report.mjs reads), SourceControl (current branch), Hasher (sha256Sync), ReportTransport.
// One writer per pipeline: RunPipeline is it while it runs.
const readJson = async (trackingStore, slug, path) => {
  try { return JSON.parse(await trackingStore.read(slug, path)) } catch { return undefined }
}
const writeJson = (trackingStore, slug, path, value) => trackingStore.write(slug, path, `${JSON.stringify(value, null, 2)}\n`)

export const createReportPublication = ({ trackingStore, sourceControl, hasher, reportTransport }) => {
  const hashText = (text) => hasher.sha256Sync(text)

  const publishTo = async ({ slug, preferences, story, kind, body, destination }) => {
    const pending = (reason) => ({ destination, status: 'pending', reason })
    const currentBranch = preferences.branch ? await sourceControl.currentBranch() : undefined
    // A saved authorized update survives a pending retry of the same report and destination.
    const prior = await readJson(trackingStore, slug, PENDING_PATH)
    const sameAttempt = prior?.packet?.story === story && prior?.packet?.kind === kind && prior?.packet?.destination === destination
    const priorDecision = sameAttempt ? (prior.decision?.action === 'update' ? prior.decision : prior.previousAuthorizedDecision) : undefined
    const previousReceipt = scopedReceipt(await readJson(trackingStore, slug, receiptPath(kind, story)), preferences, story, kind)

    let packet
    try {
      packet = preparePublication({ preferences, story, kind, destination, body, currentBranch, previousReceipt }, { hashText })
    } catch (error) {
      return pending(error.message)
    }
    await writeJson(trackingStore, slug, PENDING_PATH, { packet, ...(priorDecision ? { previousAuthorizedDecision: priorDecision } : {}) })
    if (packet.status !== 'ready') return pending(packet.reason)

    const snapshot = await reportTransport.observe({ packet })
    if (!snapshot) return pending('no trustworthy snapshot of the target')
    const decision = decidePublication(packet, snapshot, { hashText, priorDecision })
    const previousAuthorizedDecision = decision.action === 'update' ? decision
      : ['pending', 'unchanged'].includes(decision.action) ? priorDecision : undefined
    await writeJson(trackingStore, slug, PENDING_PATH, { packet, decision, ...(previousAuthorizedDecision ? { previousAuthorizedDecision } : {}) })
    if (decision.action === 'pending') return pending(decision.reason)

    const readback = await reportTransport.publish({ packet, decision })
    if (!readback) return pending(`${decision.action}: no fresh readback`)
    let recorded
    try {
      recorded = recordPublication(packet, decision, readback, { hashText })
    } catch (error) {
      return pending(`readback refused: ${error.message}`)
    }
    const receipt = { ...recorded, targets: { ...previousReceipt?.targets, ...recorded.targets } }
    await writeJson(trackingStore, slug, receiptPath(kind, story), receipt)
    await writeJson(trackingStore, slug, PUBLICATION_PATH, receipt)
    await writeJson(trackingStore, slug, PENDING_PATH, {})
    return { destination, status: decision.action === 'unchanged' ? 'unchanged' : 'published', url: recorded.targets[destination]?.url }
  }

  // → [{ destination, status: 'published' | 'unchanged' | 'pending', url?, reason? }]
  const publish = async ({ slug, preferences, story, kind, body }) => {
    const results = []
    for (const destination of ['pr', 'issue']) {
      if (!isDestinationSelected(preferences, destination)) continue
      results.push(await publishTo({ slug, preferences, story, kind, body, destination }))
    }
    return results
  }

  return Object.freeze({ publish })
}
