import { Ok, Err, isOk } from '../domain/result.mjs'
import { validatePipelineState } from '../domain/state-schema.mjs'
import {
  DIAGNOSIS,
  buildRecoveryGuidance,
  selectRollbackTarget,
  isStalePhase,
} from '../domain/recovery-policy.mjs'

// Application use case for US13 recovery/rollback. Orchestrates the stateReader,
// stateWriter and (restore-only) backupReader ports plus the pure recovery-policy
// domain. No filesystem access here — all IO is delegated to injected ports.
export const createRecoveryService = ({ stateReader, stateWriter, backupReader, stateService }) => {
  const countBackups = async (projectSlug) => {
    const backups = await backupReader.list(projectSlug)
    return backups.filter((b) => isOk(validatePipelineState(b.raw))).length
  }

  // AC1: on corrupted/incomplete/stale state, produce actionable WHY/HOW/ACTION guidance.
  const diagnose = async (projectSlug) => {
    let raw
    try {
      raw = await stateReader.read(projectSlug)
    } catch (err) {
      const backupCount = await countBackups(projectSlug)
      if (err.code === 'ENOENT') {
        return Ok(buildRecoveryGuidance({ code: DIAGNOSIS.MISSING_STATE, slug: projectSlug, backupCount }))
      }
      if (err.code === 'CORRUPTED_STATE') {
        return Ok(buildRecoveryGuidance({ code: DIAGNOSIS.CORRUPTED_STATE, slug: projectSlug, reason: err.message, backupCount }))
      }
      return Ok(buildRecoveryGuidance({ code: DIAGNOSIS.IO_ERROR, slug: projectSlug, reason: err.message }))
    }

    const validation = validatePipelineState(raw)
    if (!isOk(validation)) {
      const backupCount = await countBackups(projectSlug)
      return Ok(buildRecoveryGuidance({ code: DIAGNOSIS.INVALID_STATE, slug: projectSlug, reason: validation.error.reason, backupCount }))
    }

    const state = validation.value
    if (isStalePhase(state)) {
      return Ok(buildRecoveryGuidance({ code: DIAGNOSIS.STALE, slug: projectSlug, phase: state.currentPhase }))
    }

    return Ok(buildRecoveryGuidance({ code: DIAGNOSIS.HEALTHY, slug: projectSlug }))
  }

  // AC2: schema rollback — restore the most recent healthy backup after repeated failures.
  const rollback = async (projectSlug) => {
    const backups = await backupReader.list(projectSlug)
    const target = selectRollbackTarget(backups)
    if (target === null) {
      return Err({ code: 'NO_BACKUP', reason: `no healthy backup found for ${projectSlug}; reconstruct with 'init'` })
    }

    // Already validated by selectRollbackTarget; re-run to obtain the coerced value.
    const validation = validatePipelineState(target.raw)
    const writeResult = await stateWriter.write(projectSlug, validation.value)
    if (!isOk(writeResult)) return writeResult

    return Ok({ restoredFrom: target.name, currentPhase: validation.value.currentPhase })
  }

  // AC3: resolve a stale execution — reset the stuck phase retry budget so it can relaunch.
  const resolveStale = async (projectSlug, phase) => {
    return stateService.applyEvent(projectSlug, { type: 'RESOLVE_STALE', phase })
  }

  return { diagnose, rollback, resolveStale }
}
