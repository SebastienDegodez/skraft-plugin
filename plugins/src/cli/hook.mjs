#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHookService } from '../adapters/api/hooks/service-factory.mjs'
import { createJsonlAuditWriter } from '../adapters/infrastructure/jsonl-audit-writer.mjs'
import { createSkillFileReader } from '../adapters/infrastructure/skill-file-reader.mjs'
import { createJsonlTranscriptReader } from '../adapters/infrastructure/jsonl-transcript-reader.mjs'
import { createSubagentStartService } from '../application/subagent-start-service.mjs'
import { createSubagentStopService } from '../application/subagent-stop-service.mjs'
import { createPostToolUseService } from '../application/post-tool-use-service.mjs'
import { createJsonStateReader } from '../adapters/infrastructure/json-state-reader.mjs'
import { createRealFilesystem } from '../adapters/infrastructure/real-filesystem.mjs'
import { createGitCommitVerifier } from '../adapters/infrastructure/git-commit-verifier.mjs'
import { createLatestReleaseReader } from '../adapters/infrastructure/latest-release-reader.mjs'
import { createUpdateCheckStore } from '../adapters/infrastructure/update-check-store.mjs'
import { createSessionStartService } from '../application/session-start-service.mjs'
import { homedir } from 'node:os'

// Resolve paths from CLAUDE_PLUGIN_ROOT (set by Claude Code harness) or process.cwd().
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? join(new URL('.', import.meta.url).pathname, '../../..')
const auditLogPath = process.env.SKRAFT_AUDIT_LOG ?? join(pluginRoot, 'logs', 'skill-audit.jsonl')
const configPath = process.env.SKRAFT_CONFIG ?? join(pluginRoot, 'skraft-framework.config.json')
// Same tracking root convention as cli/state.mjs (S7 CLI bridge).
const trackingRoot = process.env.SKRAFT_TRACKING_ROOT ?? join(process.cwd(), '.copilot-tracking', 'skraft-plans')

const clock = { now: () => new Date().toISOString() }
const auditWriter = createJsonlAuditWriter(auditLogPath)
const skillFileReader = createSkillFileReader({ pluginsRoot: pluginRoot })
const stateReader = createJsonStateReader(trackingRoot)
const realFilesystem = createRealFilesystem()
// G5: recorded artifact paths are relative to the project's own tracking directory.
const filesystem = { readFile: (relPath) => realFilesystem.readFile(join(trackingRoot, relPath)) }
const commitVerifier = createGitCommitVerifier({ cwd: process.cwd() })

// Load the pre-built framework config (agentSkills, etc.); fall back to empty config on error.
let frameworkConfig = {}
try { frameworkConfig = JSON.parse(await readFile(configPath, 'utf8')) }
catch { /* fail-open: missing config means no mandatory skills, hooks still allow */ }

const subagentStart = createSubagentStartService({ config: frameworkConfig, skillFileReader, auditWriter, clock })
const subagentStop  = createSubagentStopService({
  config: frameworkConfig,
  transcriptReaderFactory: createJsonlTranscriptReader,
  auditWriter,
  clock,
  stateReader,
  filesystem,
  commitVerifier
})
const postToolUse   = createPostToolUseService({ auditWriter, clock })

// SessionStart staleness notice: installed version from the plugin manifest,
// latest from GitHub through the update-check store (~/.skraft, best-effort
// writes). Frequency policy: daily | weekly | every_session | never, default
// daily. Fail-open end to end.
// Manifest lookup covers both roots: CLAUDE_PLUGIN_ROOT = plugins/ (harness)
// and the local fallback where pluginRoot resolves to the repository root.
let installedVersion
for (const candidate of [
  join(pluginRoot, '.claude-plugin', 'plugin.json'),
  join(pluginRoot, 'plugins', '.claude-plugin', 'plugin.json')
]) {
  try { installedVersion = JSON.parse(await readFile(candidate, 'utf8')).version; break }
  catch { /* fail-open: try next candidate; unknown version means no notice */ }
}
const updateCheckStore = createUpdateCheckStore({
  storePath: process.env.SKRAFT_UPDATE_CACHE ?? join(homedir(), '.skraft', 'update-check.json')
})
const releaseReader = createLatestReleaseReader({
  store: updateCheckStore,
  frequency: process.env.SKRAFT_UPDATE_FREQUENCY,
  clock
})
const sessionStart = createSessionStartService({ releaseReader, installedVersion })

// CLI flow is dead simple: stdin in, parse JSON, route hook, stdout out.
let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

const payload = raw ? JSON.parse(raw) : {}
// argv[2] = hook event name from hooks.json ("hook.mjs SessionStart") — fallback
// when the harness payload carries no event field.
const hookService = createHookService({
  subagentStart,
  subagentStop,
  postToolUse,
  sessionStart,
  fallbackHookType: process.argv[2]
})
const result = await hookService.handle(payload)

if (result !== undefined) {
  process.stdout.write(JSON.stringify(result))
}
