#!/usr/bin/env node
// SKRAFT housekeeping CLI (US12). Runs the SessionStart auto-maintenance: trims the
// audit log to its retention window and purges stale state signals (rotated backups
// and corruption snapshots) past their retention. Wired into the SessionStart hook of
// both runtimes (plugins/hooks/hooks.json + .github/hooks/skraft-framework.json).
//
// Fail-open: reads (and ignores) the hook payload on stdin, then always exits 0 so a
// housekeeping hiccup can never block a session. A one-line JSON summary goes to
// stdout for observability.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRealFilesystem } from '../adapters/infrastructure/real-filesystem.mjs'
import { createSystemTime } from '../adapters/infrastructure/system-time.mjs'
import { createSessionStartService } from '../application/session-start-service.mjs'

// This file lives at {pluginRoot}/src/cli/housekeeping.mjs.
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? fileURLToPath(new URL('../..', import.meta.url))
const configRoot = process.env.SKRAFT_CONFIG_ROOT ?? process.cwd()
const trackingRoot = process.env.SKRAFT_TRACKING_ROOT ?? join(process.cwd(), '.copilot-tracking', 'skraft-plans')

const service = createSessionStartService({
  filesystem: createRealFilesystem(),
  clock: createSystemTime(),
  configPath: join(configRoot, 'skraft-config.json'),
  auditLogPath: process.env.SKRAFT_AUDIT_LOG ?? join(pluginRoot, 'logs', 'skill-audit.jsonl'),
  trackingRoot,
})

// Drain stdin (the hook payload) without blocking; we do not need its content.
const drainStdin = async () => {
  if (process.stdin.isTTY) return
  try { for await (const _chunk of process.stdin) { /* discard */ } }
  catch { /* ignore */ }
}

drainStdin()
  .then(() => service.run())
  .then((summary) => {
    process.stdout.write(JSON.stringify({ skraftHousekeeping: summary }) + '\n')
  })
  .catch((err) => {
    // Never fail the session on a housekeeping error.
    process.stdout.write(JSON.stringify({
      skraftHousekeeping: {
        auditPurged: 0,
        signalsPurged: 0,
        warnings: [`housekeeping failed: ${err.message}`],
      },
    }) + '\n')
    process.exitCode = 0
  })
