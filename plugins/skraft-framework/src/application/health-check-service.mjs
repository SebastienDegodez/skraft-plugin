import { join } from 'node:path'
import { resolveObservabilityConfig, detectStalePhase } from '../domain/observability-policy.mjs'

// Application use case (US12): health-check diagnostics. Assembles a fail-open report
// of the framework's operational state — version, manifests, logs, config — plus a
// stale-phase check for every tracked project. NEVER throws: each probe is guarded so
// a broken piece degrades to a `null`/`false`/`error` field instead of aborting.
//
// The overall `status` is 'warn' when any tracked phase has been IN_PROGRESS beyond
// its configured window, otherwise 'ok'.
export const createHealthCheckService = ({
  filesystem,
  clock,
  versionPath,
  manifestPaths = {},
  auditLogPath,
  configPath,
  trackingRoot,
}) => {
  const readJson = async (path) => {
    try { return { ok: true, value: JSON.parse(await filesystem.readFile(path)) } }
    catch (err) { return { ok: false, error: err } }
  }

  const probeVersion = async () => {
    const r = await readJson(versionPath)
    return r.ok && typeof r.value.version === 'string' ? r.value.version : null
  }

  const probeManifests = async () => {
    const out = {}
    for (const [name, path] of Object.entries(manifestPaths)) {
      out[name] = { path, present: await filesystem.exists(path).catch(() => false) }
    }
    return out
  }

  const probeLogs = async () => {
    try {
      if (!(await filesystem.exists(auditLogPath))) {
        return { path: auditLogPath, present: false, entries: 0 }
      }
      const content = await filesystem.readFile(auditLogPath)
      const entries = content.split('\n').filter((l) => l.trim() !== '').length
      return { path: auditLogPath, present: true, entries }
    } catch (err) {
      return { path: auditLogPath, present: false, error: err.message }
    }
  }

  const probeConfig = async () => {
    const r = await readJson(configPath)
    const raw = r.ok ? r.value : null
    return {
      path: configPath,
      present: r.ok,
      observability: resolveObservabilityConfig(raw),
    }
  }

  const probePhases = async (observability) => {
    const phases = []
    let slugs = []
    try { slugs = await filesystem.listDir(trackingRoot) }
    catch { return phases }

    for (const slug of slugs) {
      const statePath = join(trackingRoot, slug, 'state.json')
      let currentPhase = null
      let lastUpdatedMs = null
      const r = await readJson(statePath)
      if (!r.ok) continue // not a tracked project dir
      if (typeof r.value.currentPhase === 'string') currentPhase = r.value.currentPhase
      try { lastUpdatedMs = (await filesystem.stat(statePath)).mtimeMs }
      catch { /* leave null → detection reports 'unknown' */ }

      const stale = detectStalePhase({
        currentPhase,
        lastUpdatedMs,
        nowMs: clock.now().getTime(),
        stalePhaseHours: observability.stalePhaseHours,
      })
      phases.push({ project: slug, ...stale })
    }
    return phases
  }

  const run = async () => {
    const config = await probeConfig()
    const [version, manifests, logs, phases] = await Promise.all([
      probeVersion(),
      probeManifests(),
      probeLogs(),
      probePhases(config.observability),
    ])
    const status = phases.some((p) => p.level === 'warn') ? 'warn' : 'ok'
    return { status, version, manifests, logs, config, phases }
  }

  return { run }
}
