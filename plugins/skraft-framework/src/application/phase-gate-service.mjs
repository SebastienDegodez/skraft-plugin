import { evaluatePhaseClosure, isTrackingRelativePath, toTrackingPath } from '../domain/phase-gate-policy.mjs'
import { parseReviewVerdict } from '../domain/artifact-policy.mjs'

// Gathers the disk and git facts a phase closure is judged on (G4/G5) and hands them
// to the pure policy. Ports:
//   trackingFiles.exists(slug, relPath) / trackingFiles.read(slug, relPath)
//   git.headSha() — HEAD of the session repository, or null
// The review that decides a closure is the one close-phase is given, else the latest
// the phase recorded: an earlier NEEDS_REWORK never contradicts a later APPROVED.
export const createPhaseGate = ({ config, trackingFiles, git }) => ({
  check: async (slug, state, phase, { closingArtifact } = {}) => {
    const recorded = state.phaseArtifacts?.[phase] ?? []
    const missingOnDisk = []
    for (const path of recorded.filter(isTrackingRelativePath)) {
      if (!(await trackingFiles.exists(slug, path))) missingOnDisk.push(path)
    }

    let review = null
    if (config?.phaseAgents?.[phase]?.reviewer) {
      const reviews = state.reviewArtifacts?.[phase] ?? []
      const path = closingArtifact !== undefined ? toTrackingPath(closingArtifact) : reviews[reviews.length - 1]
      if (path) {
        let verdict
        try { verdict = parseReviewVerdict(await trackingFiles.read(slug, path)) } catch { verdict = undefined }
        review = { path, verdict }
      }
    }

    const deliver = phase === 'DELIVER'
    return evaluatePhaseClosure({
      phase,
      config,
      facts: {
        recorded,
        missingOnDisk,
        review,
        baseSha: deliver ? state.phaseHistory?.[phase]?.baseSha ?? null : undefined,
        headSha: deliver ? await git.headSha() : undefined,
      },
    })
  },
})
