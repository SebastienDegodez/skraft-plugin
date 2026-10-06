import { buildPipelineView, isViewableTrackedFile } from '../../domain/pipeline/pipeline-view-policy.mjs'
import { RUN_JOURNAL_PATH } from '../../domain/pipeline/run-journal-policy.mjs'
import { PENDING_PATH } from '../../domain/report-boundary-policy.mjs'
import { readReviewOutcome } from '../../domain/pipeline/review-outcome.mjs'
import { latestEvidenceLog } from '../../domain/pipeline/expected-outputs.mjs'

// Use case ObservePipeline (ports/api/observe-pipeline.mjs): what a person following a
// pipeline sees, read-only, whether a run is going on, paused or over. It reads state.json,
// the run journal, the reviews, the recorded decisions and the report receipts through
// the driven ports, and builds the view with the domain (pipeline-view-policy).
// Driven ports: StateReader, TrackingStore, TimeProvider; plus `config`, and `pricing`
// ({ eurPerUsd }) when the cost is to be shown in euros.
const DECISION = /^decisions\/[^/]+\.json$/
const RECEIPT = /^reporting\/(forecast|outcome)\/[^/]+\.json$/

export const createObservePipeline = ({ config, stateReader, trackingStore, time, pricing = {} }) => {
  const readJson = async (slug, path) => {
    try { return JSON.parse(await trackingStore.read(slug, path)) } catch { return null }
  }

  const snapshot = async (slug) => {
    let state = null
    try { state = await stateReader.read(slug) } catch { /* not started, or unreadable: the view says so */ }
    const files = await trackingStore.list(slug).catch(() => [])
    const reviewVerdicts = {}
    for (const path of files.filter((file) => /^reviews\/.+\.md$/.test(file))) {
      let text = null
      try { text = await trackingStore.read(slug, path) } catch { /* unreadable: no verdict */ }
      reviewVerdicts[path] = readReviewOutcome(text).verdict
    }
    const decisions = []
    for (const path of files.filter((file) => DECISION.test(file))) {
      const decision = await readJson(slug, path)
      if (decision?.key) decisions.push({ key: decision.key, answer: decision.answer, by: decision.by ?? null, at: decision.at ?? null })
    }
    const receipts = []
    for (const path of files.filter((file) => RECEIPT.test(file))) {
      const receipt = await readJson(slug, path)
      if (receipt) receipts.push(receipt)
    }
    const evidenceLog = latestEvidenceLog([
      ...(state?.phaseArtifacts?.DELIVER ?? []),
      ...files.filter((file) => /^evidence\/.+\/qg-[^/]+\.json$/.test(file)),
    ])
    return buildPipelineView({
      evidenceLog,
      evidence: evidenceLog ? await readJson(slug, evidenceLog) : null,
      eurPerUsd: pricing.eurPerUsd ?? null,
      slug,
      config,
      state,
      run: await readJson(slug, RUN_JOURNAL_PATH),
      files,
      reviewVerdicts,
      decisions,
      receipts,
      pending: await readJson(slug, PENDING_PATH),
      now: time.isoString(),
    })
  }

  // The text of one tracking file the view lists (a review, a report, a decision): null
  // for anything else, so a viewer never reads outside the pipeline's own files.
  const readTracked = async (slug, path) => {
    const files = await trackingStore.list(slug).catch(() => [])
    if (!isViewableTrackedFile(path, files)) return null
    try { return await trackingStore.read(slug, path) } catch { return null }
  }

  return Object.freeze({ snapshot, readTracked })
}
