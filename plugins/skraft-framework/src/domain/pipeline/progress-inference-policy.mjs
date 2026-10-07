import { expectedTrackedOutputs, matchOutputs } from './expected-outputs.mjs'

// Pure: after a state reset, which phases the files on disk show completed — what
// skraft-orchestrator.md "Recovery" step 2–3 inferred by hand. A phase counts when its
// specialist's required outputs are all there and, for a reviewed phase, an APPROVED
// review is; the first phase that falls short is where the pipeline resumes.

const REVIEW = /^reviews\/(\d{4}-\d{2}-\d{2})\/([a-z]+)-review-(\d+)\.md$/

// The review files of a phase, newest first (date, then number).
export const reviewFilesOf = (phase, files) => files
  .map((file) => ({ file, match: REVIEW.exec(file) }))
  .filter(({ match }) => match && match[2] === String(phase).toLowerCase())
  .sort((a, b) => (b.match[1].localeCompare(a.match[1])) || (Number(b.match[3]) - Number(a.match[3])))
  .map(({ file }) => file)

// files — every tracking-relative file; approvedReview(phase) — the path of its newest
// APPROVED review, or null. Returns [{ phase, artifacts, review }] in phase order.
export const inferCompletedPhases = ({ phaseOrder, config, files, approvedReview }) => {
  const completed = []
  for (const phase of phaseOrder.filter((p) => p !== 'DONE')) {
    const { specialist, reviewer } = config.phaseAgents?.[phase] ?? {}
    if (!specialist) break
    const { found, missing } = matchOutputs(files, expectedTrackedOutputs(specialist, config))
    if (missing.length > 0 || found.length === 0) break
    const review = reviewer ? approvedReview(phase) : null
    if (reviewer && !review) break
    completed.push(Object.freeze({ phase, artifacts: found, review }))
  }
  return completed
}
