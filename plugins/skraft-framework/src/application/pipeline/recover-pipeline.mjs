import { inferCompletedPhases, reviewFilesOf } from '../../domain/pipeline/progress-inference-policy.mjs'
import { readReviewOutcome } from '../../domain/pipeline/review-outcome.mjs'
import { blocked } from './checkpoint.mjs'

// Step of RunPipeline: bring state.json back to a usable shape before the run — what
// skraft-orchestrator.md "Recovery" asked the orchestrator to do by hand.
//   diagnose (RecoveryService) → run the step it calls for (domain recoveryStepOf):
//     none           nothing to do
//     init           no state yet: create it; files already on disk → reconstruct
//     rollback       restore the newest healthy state.json.bak.*
//     reset          a state nothing can use: a fresh one, then reconstruct
//     resolve-stale  the open phase spent its retry budget: a fresh one, once the human
//                    says relaunch (checkpoint stale:<phase>:…)
//     halt           the state cannot be read (IO): stop, saying why
//   reconstruct → the phases the files show completed (domain progress-inference-policy),
//   recorded only once the human confirms (checkpoint recovery:<phases>).
export const createPipelineRecovery = ({ recovery, stateService, trackingStore, config, phaseOrder, ask, apply, readState, progress, now }) => {
  const newestApprovedReviews = async (slug, files) => {
    const approved = {}
    for (const phase of phaseOrder) {
      const newest = reviewFilesOf(phase, files)[0]
      if (!newest) continue
      let text = null
      try { text = await trackingStore.read(slug, newest) } catch { /* unreadable: not approved */ }
      if (readReviewOutcome(text).verdict === 'APPROVED') approved[phase] = newest
    }
    return approved
  }

  const reconstruct = async (slug) => {
    const files = await trackingStore.list(slug)
    const approved = await newestApprovedReviews(slug, files)
    const completed = inferCompletedPhases({ phaseOrder, config, files, approvedReview: (phase) => approved[phase] ?? null })
    if (completed.length === 0) return
    const names = completed.map(({ phase }) => phase)
    const answer = await ask(slug, null, {
      key: `recovery:${names.join(',')}`,
      question: `state.json was rebuilt. The files on disk show ${names.join(', ')} completed. ` +
        'Answer "resume" to record them and resume at the next phase, or "restart" to run every phase again.',
      options: ['resume', 'restart'],
    })
    if (answer.toLowerCase() !== 'resume') {
      progress.log('recovery: restarting from the first phase')
      return
    }
    for (const { phase, artifacts, review } of completed) {
      try {
        for (const path of artifacts) await apply(slug, { type: 'RECORD_ARTIFACT', phase, path })
        await apply(slug, { type: 'CLOSE_PHASE', phase, verdict: 'APPROVED', ...(review ? { path: review } : {}), at: now() })
      } catch (error) {
        progress.log(`recovery: ${phase} stays open — ${error.reason ?? error.message ?? error}`)
        return
      }
      progress.log(`recovery: ${phase} recorded as completed`)
    }
  }

  const recover = async (slug) => {
    const diagnosed = await recovery.diagnose(slug)
    const guidance = diagnosed.value
    if (guidance.step === 'none') return
    if (guidance.step !== 'init') progress.log(`state.json ${guidance.code}: ${guidance.why}`)
    switch (guidance.step) {
      case 'init': {
        const created = await stateService.init(slug)
        if (!created.ok) throw blocked(null, `state.json for ${slug}: ${created.error.code}`)
        await reconstruct(slug)
        return
      }
      case 'rollback': {
        const restored = await recovery.rollback(slug)
        if (!restored.ok) throw blocked(null, `rollback refused: ${restored.error.reason}`)
        progress.log(`recovery: restored ${restored.value.restoredFrom} (${restored.value.currentPhase})`)
        return
      }
      case 'reset': {
        const fresh = await recovery.reset(slug)
        if (!fresh.ok) throw blocked(null, `reset refused: ${fresh.error.reason}`)
        await reconstruct(slug)
        return
      }
      case 'resolve-stale': {
        const { currentPhase, retryCount = {}, reviewArtifacts = {} } = await readState(slug)
        const answer = await ask(slug, currentPhase, {
          key: `stale:${currentPhase}:t${retryCount[currentPhase] ?? 0}:r${(reviewArtifacts[currentPhase] ?? []).length}`,
          question: `${currentPhase} spent its retry budget without an APPROVED review. ` +
            'Answer "relaunch" to give it a fresh budget and run it again, or "stop".',
          options: ['relaunch', 'stop'],
        })
        if (answer.toLowerCase() !== 'relaunch') throw blocked(currentPhase, `${currentPhase} retry budget exhausted; stopped by the human`)
        const resolved = await recovery.resolveStale(slug, currentPhase)
        if (!resolved.ok) throw blocked(currentPhase, `resolve-stale refused: ${resolved.error.reason}`)
        progress.log(`recovery: ${currentPhase} gets a fresh retry budget`)
        return
      }
      default:
        throw blocked(null, `${guidance.code}: ${guidance.why}`)
    }
  }

  return Object.freeze({ recover })
}
