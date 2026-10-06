import { Ok, Err } from '../../domain/result.mjs'
import { ARTIFACTS, normalize, validate } from '../../domain/artifact-registry.mjs'
import {
  MANUAL_CLOSURE_COMMIT_SCAN,
  manualClosePath,
  manualClosureRefusal,
  manualClosureReview,
} from '../../domain/pipeline/manual-closure-policy.mjs'
import { renderArtifact } from '../render-artifact.mjs'
import { createCommitScanService } from '../commit-scan-service.mjs'
import { createPipelineStateService } from './pipeline-state.mjs'

// Use case CloseManually (ports/api/close-manually.mjs): the open, reviewed phase ends
// through human-validated reworks instead of a reviewer APPROVED. In order:
//   1. refuse what cannot be closed (domain manual-closure-policy)
//   2. DELIVER: the recent commits must follow `type(scope): subject` — renaming them
//      rewrites history, so that stays the human's (NON_CONVENTIONAL_COMMITS lists them)
//   3. count the rework pass (INCR_REWORK, with the findings it fixed)
//   4. render reviews/{date}/manual-close.md from data with the review-verdict template
//   5. CLOSE_PHASE with that review, through the state machine and the phase gate
// Driven ports: stateReader, stateWriter, trackingStore, sourceControl, templateReader, time.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const createCloseManually = (deps) => {
  const { config, trackingStore, sourceControl, templateReader, time } = deps
  const { stateService } = createPipelineStateService(deps)
  const commitScan = createCommitScanService({ commitLogReader: sourceControl })

  const renderClosingReview = async () => {
    const data = normalize('review-verdict', manualClosureReview())
    const valid = validate('review-verdict', data)
    if (!valid.ok) return Err({ code: 'INVALID_REVIEW', reason: JSON.stringify({ missing: valid.missing, invalid: valid.invalid }) })
    const template = await templateReader.read(ARTIFACTS['review-verdict'].template)
    return Ok(renderArtifact('review-verdict', data, { readTemplate: () => template }))
  }

  const close = async ({ slug, phase, findings = 0 } = {}) => {
    if (typeof slug !== 'string' || !SLUG.test(slug)) return Err({ code: 'INVALID_SLUG', reason: `slug must be kebab-case, got ${JSON.stringify(slug)}` })
    if (!Number.isInteger(findings) || findings < 0) return Err({ code: 'INVALID_ARGUMENT', reason: `findings must be a non-negative integer, got ${JSON.stringify(findings)}` })

    const current = await stateService.get(slug)
    if (!current.ok) return current
    const open = current.value.currentPhase
    const refusal = manualClosureRefusal({ phase, currentPhase: open, reviewer: config.phaseAgents?.[open]?.reviewer })
    if (refusal) return Err(refusal)

    if (open === 'DELIVER') {
      const { nonConventional } = await commitScan.scanRecent(MANUAL_CLOSURE_COMMIT_SCAN)
      if (nonConventional.length > 0) {
        return Err({
          code: 'NON_CONVENTIONAL_COMMITS',
          reason: `rename these commits to type(scope): subject first: ${nonConventional.map(({ sha, subject }) => `${sha.slice(0, 7)} "${subject}"`).join(', ')}`,
          commits: nonConventional,
        })
      }
    }

    const reworked = await stateService.applyEvent(slug, { type: 'INCR_REWORK', phase: open, findings })
    if (!reworked.ok) return reworked

    const review = await renderClosingReview()
    if (!review.ok) return review
    const path = manualClosePath(time.isoString().slice(0, 10))
    await trackingStore.write(slug, path, review.value)

    const closed = await stateService.applyEvent(slug, { type: 'CLOSE_PHASE', phase: open, verdict: 'APPROVED', path, at: time.isoString() })
    if (!closed.ok) return closed
    return Ok(Object.freeze({ phase: open, next: closed.value.currentPhase, review: path }))
  }

  return Object.freeze({ close })
}
