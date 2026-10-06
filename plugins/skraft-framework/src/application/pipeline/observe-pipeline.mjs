import { buildPipelineView, isViewableTrackedFile } from '../../domain/pipeline/pipeline-view-policy.mjs'
import { RUN_JOURNAL_PATH } from '../../domain/pipeline/run-journal-policy.mjs'
import { PENDING_PATH } from '../../domain/report-boundary-policy.mjs'
import { readReviewOutcome } from '../../domain/pipeline/review-outcome.mjs'
import { latestEvidenceLog } from '../../domain/pipeline/expected-outputs.mjs'
import { pipelineChooserView, selectPipeline, summarizePipeline } from '../../domain/pipeline/pipeline-selection-policy.mjs'

// Use case ObservePipeline (ports/api/observe-pipeline.mjs): what a person following a
// pipeline sees, read-only, whether a run is going on, paused or over. It reads state.json,
// the run journal, the reviews, the recorded decisions and the report receipts through
// the driven ports, and builds the view with the domain (pipeline-view-policy).
// Driven ports: StateReader, TrackingStore, TimeProvider; SourceControl and ActivePipeline
// to find the pipeline of the current branch; plus `config`, and `pricing` ({ eurPerUsd })
// when the cost is to be shown in euros.
const DECISION = /^decisions\/[^/]+\.json$/
const RECEIPT = /^reporting\/(forecast|outcome)\/[^/]+\.json$/

export const createObservePipeline = ({ config, stateReader, trackingStore, time, sourceControl = null, activePipeline = null, pricing = {} }) => {
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

  // Every pipeline the repository tracks, newest first, as a chooser lists them.
  const pipelines = async () => {
    const slugs = await trackingStore.projects?.().catch(() => []) ?? []
    const out = []
    for (const slug of slugs) {
      let state = null
      try { state = await stateReader.read(slug) } catch { /* run.json only, or unreadable */ }
      out.push(summarizePipeline({ slug, state, run: await readJson(slug, RUN_JOURNAL_PATH) }))
    }
    return out
  }

  // The pipeline to show: { slug, reason } — slug null when none fits, with the chooser
  // view (the pipelines and the current branch) to show instead.
  const locate = async (requested = null) => {
    if (requested !== null && requested !== undefined) return { ...selectPipeline({ requested }), chooser: null }
    const known = await pipelines()
    const branch = await sourceControl?.currentBranch().catch(() => null) ?? null
    const active = await activePipeline?.current().catch(() => null) ?? null
    const selected = selectPipeline({ branch, active, pipelines: known })
    return { ...selected, chooser: selected.slug ? null : pipelineChooserView({ branch, reason: selected.reason, pipelines: known }) }
  }

  return Object.freeze({ snapshot, readTracked, pipelines, locate })
}
