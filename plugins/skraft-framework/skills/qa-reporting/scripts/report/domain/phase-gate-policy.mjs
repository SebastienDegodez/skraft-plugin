import { artifactPatternToRegExp } from './artifact-policy.mjs'

// Pure policy for closing a phase (G4/G5), evaluated by the state CLI when the
// orchestrator runs `transition` or `close-phase` — after it recorded what the
// subagents produced. No IO: the application layer supplies the disk and git facts.
//
// One path convention: every recorded path is relative to the project's tracking
// directory ({trackingRoot}/{slug}/), e.g. `reviews/2026-09-23/design-review-1.md`.

const TRACKING_PREFIX = /^\.copilot-tracking\/skraft-plans\/\{projectSlug\}\//

// A descriptor output is `path` or `path (comment)`; a comment starting with
// "optional" marks an artefact produced only in some cases. Text that is not a single
// path token (e.g. "Source code commits") is not a file and is never checked.
export const parseOutputEntry = (entry) => {
  const match = typeof entry === 'string' ? entry.trim().match(/^(\S+)(?:\s+\((.*)\))?$/) : null
  if (!match) return null
  return { pattern: match[1], optional: /^optional\b/i.test(match[2] ?? '') }
}

// Required outputs an agent writes inside the tracking directory, as tracking-relative
// patterns. Repository outputs (docs/adr, tests/**) are committed code, not recorded.
export const requiredTrackedOutputs = (agentName, config) =>
  (config?.agentArtifacts?.[agentName]?.outputs ?? [])
    .map(parseOutputEntry)
    .filter((entry) => entry && !entry.optional && TRACKING_PREFIX.test(entry.pattern))
    .map((entry) => entry.pattern.replace(TRACKING_PREFIX, ''))

// A recorded path must stay inside the project's tracking directory.
export const isTrackingRelativePath = (path) =>
  typeof path === 'string' && path.length > 0 && !/^(?:[/\\]|[A-Za-z]:)/.test(path) && !path.split(/[/\\]/).includes('..')

// The tracking-relative form of a path given either way: a repository-relative
// .copilot-tracking/skraft-plans/{slug}/… loses its prefix. Null when it would escape.
const REPOSITORY_TRACKING_PREFIX = /^\.copilot-tracking[/\\]skraft-plans[/\\][a-z0-9]+(?:-[a-z0-9]+)*[/\\]/
export const toTrackingPath = (path) => {
  const relative = typeof path === 'string' ? path.replace(REPOSITORY_TRACKING_PREFIX, '') : path
  return isTrackingRelativePath(relative) ? relative : null
}

// The review file's vocabulary mapped onto the state's: a reviewer writes APPROVED,
// NEEDS_REWORK or REJECTED; the state records APPROVED or CHANGES_REQUESTED.
export const toStateVerdict = (reviewVerdict) => {
  if (reviewVerdict === 'APPROVED') return 'APPROVED'
  if (reviewVerdict === 'NEEDS_REWORK' || reviewVerdict === 'REJECTED') return 'CHANGES_REQUESTED'
  return null
}

const violation = (code, reason) => Object.freeze({ code, reason })

// facts:
//   recorded      — phaseArtifacts[phase] as recorded
//   missingOnDisk — recorded paths the tracking directory does not hold
//   review        — { path, verdict } of the review that decides the closure, or null
//   baseSha       — phaseHistory[phase].baseSha, headSha — HEAD now (DELIVER only)
export const evaluatePhaseClosure = ({ phase, config, facts }) => {
  const phaseAgents = config?.phaseAgents?.[phase] ?? {}
  const violations = []

  const recorded = facts.recorded ?? []
  for (const path of recorded.filter((p) => !isTrackingRelativePath(p))) {
    violations.push(violation('PATH_OUTSIDE_TRACKING', `${path} is not relative to the tracking directory`))
  }
  for (const pattern of requiredTrackedOutputs(phaseAgents.specialist, config)) {
    const re = artifactPatternToRegExp(pattern)
    if (!recorded.some((path) => re.test(path))) {
      violations.push(violation('ARTIFACT_MISSING', `${phase} recorded no artefact matching ${pattern}; record it with state.mjs record-artifact`))
    }
  }
  for (const path of facts.missingOnDisk ?? []) {
    violations.push(violation('ARTIFACT_NOT_FOUND', `${path} is recorded for ${phase} but absent from the tracking directory`))
  }

  if (phaseAgents.reviewer) {
    const review = facts.review
    if (!review) {
      violations.push(violation('REVIEW_MISSING', `${phase} has no recorded review; record the reviewer's file with record-review-artifact, or pass --artifact to close-phase`))
    } else if (review.verdict === undefined) {
      violations.push(violation('REVIEW_NOT_FOUND', `${review.path} is absent from the tracking directory`))
    } else if (toStateVerdict(review.verdict) !== 'APPROVED') {
      violations.push(violation('VERDICT_MISMATCH', `${review.path} records ${review.verdict ?? 'no verdict'}, not APPROVED`))
    }
  }

  if (phase === 'DELIVER') {
    if (!facts.baseSha) {
      violations.push(violation('BASE_UNRECORDED', 'DELIVER has no base commit; run state.mjs mark-phase-started --phase DELIVER before dispatching the engineer'))
    } else if (!facts.headSha || facts.headSha === facts.baseSha) {
      violations.push(violation('NO_COMMIT', `DELIVER produced no commit since its base ${facts.baseSha}`))
    }
  }

  return violations
}
