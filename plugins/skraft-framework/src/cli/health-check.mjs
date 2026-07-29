#!/usr/bin/env node
// SKRAFT health-check CLI (US12). Prints a fail-open JSON diagnostics report:
// framework version, hook manifests, audit log, repo config and stale-phase warnings.
//
//   node health-check.mjs
//
// Exit codes:
//   0  status ok
//   1  status warn (a phase has been IN_PROGRESS past its configured window)
//   2  unexpected error (should not happen — the service is fail-open)
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRealFilesystem } from '../adapters/infrastructure/real-filesystem.mjs'
import { createSystemTime } from '../adapters/infrastructure/system-time.mjs'
import { createHealthCheckService } from '../application/health-check-service.mjs'

// This file lives at {pluginRoot}/src/cli/health-check.mjs.
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? fileURLToPath(new URL('../..', import.meta.url))
const configRoot = process.env.SKRAFT_CONFIG_ROOT ?? process.cwd()
const trackingRoot = process.env.SKRAFT_TRACKING_ROOT ?? join(process.cwd(), '.copilot-tracking', 'skraft-plans')

const service = createHealthCheckService({
  filesystem: createRealFilesystem(),
  clock: createSystemTime(),
  versionPath: join(pluginRoot, '.claude-plugin', 'plugin.json'),
  manifestPaths: {
    claudeHooks: join(pluginRoot, 'hooks', 'hooks.json'),
    copilotHooks: join(process.cwd(), '.github', 'hooks', 'skraft-framework.json'),
    frameworkConfig: process.env.SKRAFT_CONFIG ?? join(pluginRoot, 'skraft-framework.config.json'),
  },
  auditLogPath: process.env.SKRAFT_AUDIT_LOG ?? join(pluginRoot, 'logs', 'skill-audit.jsonl'),
  configPath: join(configRoot, 'skraft-config.json'),
  trackingRoot,
})

service.run()
  .then((report) => {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exitCode = report.status === 'warn' ? 1 : 0
  })
  .catch((err) => {
    process.stderr.write(JSON.stringify({ code: 'IO_ERROR', reason: err.message }) + '\n')
    process.exitCode = 2
  })
