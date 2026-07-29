import { join } from 'node:path'
import {
  resolveObservabilityConfig,
  planAuditRetention,
  planStaleSignals,
  isStaleSignalFile,
} from '../domain/observability-policy.mjs'

// Application use case (US12): SessionStart housekeeping. Auto-maintenance that runs
// once per session — trims the append-only audit log to its retention window and
// purges stale state signals (rotated backups / corruption snapshots). Fail-open by
// design: every step is guarded so a housekeeping error can NEVER block a session.
//
// All IO is delegated to the injected filesystem port + clock. Thresholds come from
// the repo config's `observability` block (see domain/observability-policy.mjs).
export const createSessionStartService = ({
  filesystem,
  clock,
  configPath,
  auditLogPath,
  trackingRoot,
}) => {
  const nowMs = () => clock.now().getTime()

  const readObservability = async () => {
    try {
      const raw = JSON.parse(await filesystem.readFile(configPath))
      return resolveObservabilityConfig(raw)
    } catch {
      return resolveObservabilityConfig(null)
    }
  }

  // Rewrite the audit log with only the lines inside the retention window.
  const trimAuditLog = async (retentionDays, warnings) => {
    try {
      if (!(await filesystem.exists(auditLogPath))) return 0
      const content = await filesystem.readFile(auditLogPath)
      const lines = content.split('\n')
      const { kept, purged } = planAuditRetention({ lines, nowMs: nowMs(), retentionDays })
      if (purged > 0) {
        await filesystem.writeFile(auditLogPath, kept.length > 0 ? kept.join('\n') + '\n' : '')
      }
      return purged
    } catch (err) {
      warnings.push(`audit trim failed: ${err.message}`)
      return 0
    }
  }

  // Purge stale backup/corruption snapshots across every tracked project directory.
  const purgeStaleSignals = async (retentionDays, warnings) => {
    let purged = 0
    try {
      const slugs = await filesystem.listDir(trackingRoot)
      for (const slug of slugs) {
        const dir = join(trackingRoot, slug)
        let names
        try {
          names = (await filesystem.listDir(dir)).filter(isStaleSignalFile)
        } catch (err) {
          warnings.push(`list ${slug} failed: ${err.message}`)
          continue
        }
        const entries = []
        for (const name of names) {
          try {
            const { mtimeMs } = await filesystem.stat(join(dir, name))
            entries.push({ name, mtimeMs })
          } catch { /* undatable → skip (never purged) */ }
        }
        const { purge } = planStaleSignals({ entries, nowMs: nowMs(), retentionDays })
        for (const name of purge) {
          try {
            await filesystem.remove(join(dir, name))
            purged += 1
          } catch (err) {
            warnings.push(`remove ${slug}/${name} failed: ${err.message}`)
          }
        }
      }
    } catch (err) {
      warnings.push(`signal purge failed: ${err.message}`)
    }
    return purged
  }

  const run = async () => {
    const warnings = []
    const observability = await readObservability()
    const auditPurged = await trimAuditLog(observability.auditRetentionDays, warnings)
    const signalsPurged = await purgeStaleSignals(observability.signalRetentionDays, warnings)
    return { auditPurged, signalsPurged, warnings }
  }

  return { run }
}
