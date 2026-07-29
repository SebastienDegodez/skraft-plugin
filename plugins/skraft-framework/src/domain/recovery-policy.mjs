import { validatePipelineState } from './state-schema.mjs'
import { isOk } from './result.mjs'

// Pure recovery/rollback policy (US13 — genesis A9/S4). No IO, no side effects.
// The CREATION of backups (state.json.bak.*) and the corrupted snapshot is owned by
// the atomic writer of #60. This module only *infers* and *selects* from them; it
// never writes. The application layer (recovery-service) performs the actual restore.

// Diagnosis codes surfaced to the orchestrator/human.
export const DIAGNOSIS = Object.freeze({
  HEALTHY: 'HEALTHY',
  MISSING_STATE: 'MISSING_STATE',
  CORRUPTED_STATE: 'CORRUPTED_STATE',
  INVALID_STATE: 'INVALID_STATE',
  STALE: 'STALE',
  IO_ERROR: 'IO_ERROR',
})

// Extract the numeric timestamp from a rotating backup filename
// (state.json.bak.{ts}). Returns NaN when the name does not match.
export const parseBackupTimestamp = (filename) => {
  const match = /^state\.json\.bak\.(\d+)$/.exec(filename)
  return match ? Number(match[1]) : NaN
}

// A phase is stale when its rework loop is exhausted: retryCount has reached the
// per-phase cap AND the verdict is not APPROVED, so the pipeline can neither ADVANCE
// (verdict not APPROVED) nor retry (cap reached) — it is stuck and must be relaunched.
export const isStalePhase = (state, phase = state.currentPhase) => {
  const maxRetries = state?.userPreferences?.maxRetriesPerPhase ?? 2
  const retries = state?.retryCount?.[phase] ?? 0
  const verdict = state?.verdicts?.[phase] ?? null
  return retries >= maxRetries && verdict !== 'APPROVED'
}

// Chooses the most recent backup whose parsed content passes schema validation.
// backups: [{ name, timestamp, raw }] where `raw` is the parsed JSON (or null when
// the backup itself is unreadable/corrupt). Returns the winning backup or null.
export const selectRollbackTarget = (backups) => {
  const candidates = (backups ?? [])
    .filter((b) => b && Number.isFinite(b.timestamp) && isOk(validatePipelineState(b.raw)))
    .sort((a, b) => b.timestamp - a.timestamp)
  return candidates.length > 0 ? candidates[0] : null
}

// Guidance `action` strings reference the CLI by the bare `state.mjs {subcommand}`
// form used throughout skraft-state.instructions.md; they are indicative next-steps
// for the orchestrator, not literal argv (the real entry is $CLAUDE_PLUGIN_ROOT/src/cli/state.mjs).
const CLI = 'state.mjs'

// Produces actionable guidance for a diagnosis, structured as WHY / HOW / ACTION.
//   diagnosis: { code, slug, reason, backupCount, phase }
// Returns { code, why, how: string[], action: string }.
export const buildRecoveryGuidance = (diagnosis) => {
  const { code, slug = '{slug}', reason, backupCount = 0, phase } = diagnosis ?? {}
  const hasBackup = backupCount > 0
  const rollbackAction = `${CLI} rollback --slug ${slug}`

  switch (code) {
    case DIAGNOSIS.HEALTHY:
      return {
        code,
        why: `state.json for ${slug} is present and passes schema validation.`,
        how: ['No recovery required — resume the pipeline normally.'],
        action: `${CLI} get --slug ${slug}`,
      }

    case DIAGNOSIS.MISSING_STATE:
      return {
        code,
        why: `state.json for ${slug} is missing (no snapshot on disk).`,
        how: hasBackup
          ? [`A rotating backup exists — restore the most recent healthy one.`]
          : [
              'No backup exists — reconstruct a snapshot with conservative defaults.',
              'Infer the highest completed phase from on-disk artifacts, then confirm with the user before resuming.',
            ],
        action: hasBackup ? rollbackAction : `${CLI} init --slug ${slug}`,
      }

    case DIAGNOSIS.CORRUPTED_STATE:
      return {
        code,
        why: `state.json for ${slug} is corrupted (invalid JSON)${reason ? `: ${reason}` : '.'}`,
        how: hasBackup
          ? [
              'The corrupted file was snapshotted to state.json.corrupted.{ts} by the reader.',
              'Roll back to the most recent healthy backup.',
            ]
          : [
              'The corrupted file was snapshotted to state.json.corrupted.{ts} by the reader.',
              'No backup is recoverable — reconstruct a snapshot with conservative defaults and confirm with the user.',
            ],
        action: hasBackup ? rollbackAction : `${CLI} init --slug ${slug}`,
      }

    case DIAGNOSIS.INVALID_STATE:
      return {
        code,
        why: `state.json for ${slug} fails schema validation${reason ? `: ${reason}` : '.'}`,
        how: hasBackup
          ? ['The recorded shape is invalid — roll back to the most recent healthy backup.']
          : ['The recorded shape is invalid and no backup is recoverable — re-initialize and confirm with the user.'],
        action: hasBackup ? rollbackAction : `${CLI} init --slug ${slug}`,
      }

    case DIAGNOSIS.STALE: {
      const target = phase ?? 'the current phase'
      return {
        code,
        why: `phase ${target} for ${slug} is stale: its retry budget is exhausted and the verdict is not APPROVED, so the pipeline is stuck.`,
        how: [
          'Reset the phase retry counter so the phase agent can be relaunched.',
          'Then re-dispatch the phase and record a fresh verdict.',
        ],
        action: `${CLI} resolve-stale --slug ${slug}${phase ? ` --phase ${phase}` : ''}`,
      }
    }

    default:
      return {
        code: DIAGNOSIS.IO_ERROR,
        why: `state.json for ${slug} could not be read${reason ? `: ${reason}` : '.'}`,
        how: ['Check filesystem permissions and disk availability, then retry the read.'],
        action: `${CLI} get --slug ${slug}`,
      }
  }
}
