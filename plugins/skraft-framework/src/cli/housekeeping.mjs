#!/usr/bin/env node
// SKRAFT SessionStart CLI. Wired into the SessionStart hook of both runtimes.
//
// 1. Hands the session the plugin's location: appends `export SKRAFT_PLUGIN_ROOT=…` to
//    Claude Code's CLAUDE_ENV_FILE (every later Bash call and hook sees it) and injects
//    the absolute path, plus the active pipeline, as session context on both harnesses.
// 2. Housekeeping (US12): trims the audit log to its retention window and purges stale
//    state signals (rotated backups and corruption snapshots); the summary is audited.
//
// Fail-open: always exits 0 so a SessionStart hiccup can never block a session.
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRealFilesystem } from '../adapters/infrastructure/real-filesystem.mjs'
import { createSystemTime } from '../adapters/infrastructure/system-time.mjs'
import { createSessionStartService } from '../application/session-start-service.mjs'
import { resolvePluginRootFromEnv } from '../adapters/infrastructure/plugin-root-resolver.mjs'
import { resolveTrackingRoot } from '../adapters/infrastructure/tracking-root-resolver.mjs'
import { resolveAuditLogPath } from '../adapters/infrastructure/audit-log-resolver.mjs'
import { createActiveSlugStore } from '../adapters/infrastructure/active-slug-store.mjs'
import { createJsonlAuditWriter } from '../adapters/infrastructure/jsonl-audit-writer.mjs'
import { toHarnessOutput } from '../adapters/api/hooks/harness-output.mjs'
import { envFileLines, sessionContext } from '../domain/session-context-policy.mjs'
import { firstValidProjectSlug } from '../domain/value-objects.mjs'

const pluginRoot = resolvePluginRootFromEnv({ moduleUrl: import.meta.url })

const readPayload = async () => {
  if (process.stdin.isTTY) return {}
  let raw = ''
  try { for await (const chunk of process.stdin) raw += chunk } catch { /* ignore */ }
  try { return raw.trim() ? JSON.parse(raw) : {} } catch { return {} }
}

const activePipeline = (trackingRoot) => {
  const activeSlug = firstValidProjectSlug(process.env.SKRAFT_PROJECT_SLUG, createActiveSlugStore(trackingRoot).read())
  if (!activeSlug) return {}
  try {
    const { currentPhase } = JSON.parse(readFileSync(join(trackingRoot, activeSlug, 'state.json'), 'utf8'))
    return { activeSlug, currentPhase }
  } catch {
    return { activeSlug }
  }
}

const payload = await readPayload()
const cwd = typeof payload.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : process.cwd()
const trackingRoot = resolveTrackingRoot({ cwd })
const auditWriter = createJsonlAuditWriter(resolveAuditLogPath({ cwd, pluginRoot }))
const clock = createSystemTime()

try {
  if (process.env.CLAUDE_ENV_FILE) appendFileSync(process.env.CLAUDE_ENV_FILE, envFileLines({ pluginRoot }))
} catch (err) {
  await auditWriter.write({ eventType: 'EnvFileWriteFailed', reason: err.message, timestamp: clock.now().toISOString() }).catch(() => {})
}

try {
  const summary = await createSessionStartService({
    filesystem: createRealFilesystem(),
    clock,
    configPath: join(process.env.SKRAFT_CONFIG_ROOT ?? cwd, 'skraft-config.json'),
    auditLogPath: resolveAuditLogPath({ cwd, pluginRoot }),
    trackingRoot,
  }).run()
  await auditWriter.write({ eventType: 'HousekeepingRan', ...summary, timestamp: clock.now().toISOString() })
} catch (err) {
  await auditWriter.write({ eventType: 'HousekeepingFailed', reason: err.message, timestamp: clock.now().toISOString() }).catch(() => {})
}

const context = sessionContext({ pluginRoot, ...activePipeline(trackingRoot) })
process.stdout.write(JSON.stringify(toHarnessOutput({ decision: 'additionalContext', context }, 'SessionStart')))
process.exitCode = 0
