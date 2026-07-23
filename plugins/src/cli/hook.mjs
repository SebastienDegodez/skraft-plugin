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
import { createPreToolUseService } from '../application/pre-tool-use-service.mjs'
import { createPreToolUseSessionGuardService } from '../application/pre-tool-use-session-guard-service.mjs'
import { createPreToolUseCompositeService } from '../application/pre-tool-use-composite.mjs'
import { createJsonStateReader } from '../adapters/infrastructure/json-state-reader.mjs'
import { createRealFilesystem } from '../adapters/infrastructure/real-filesystem.mjs'
import { createGitCommitVerifier } from '../adapters/infrastructure/git-commit-verifier.mjs'
import { resolvePluginRootFromEnv } from '../adapters/infrastructure/plugin-root-resolver.mjs'
import { resolveTrackingRoot } from '../adapters/infrastructure/tracking-root-resolver.mjs'

// Resolve the plugin root (US16): CLAUDE_PLUGIN_ROOT (harness-injected) →
// cache glob (~/.claude/plugins/cache/*/skraft/*) → module-relative fallback.
const pluginRoot = resolvePluginRootFromEnv({ moduleUrl: import.meta.url })
const auditLogPath = process.env.SKRAFT_AUDIT_LOG ?? join(pluginRoot, 'logs', 'skill-audit.jsonl')
const configPath = process.env.SKRAFT_CONFIG ?? join(pluginRoot, 'skraft-framework.config.json')
// Same tracking-root resolution as cli/state.mjs (SKRAFT_TRACKING_ROOT → layout env →
// skraft-config.json::trackingLayout → default namespaced), so guards read state.json
// from the layout-correct location.
const trackingRoot = resolveTrackingRoot()

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
const postToolUse   = createPostToolUseService({ auditWriter, clock, stateReader, config: frameworkConfig })
// PreToolUse composite: G1 dispatch-order guard + G7/G8 session guard (see composite).
const preToolUse    = createPreToolUseCompositeService({
  dispatchGuard: createPreToolUseService({ stateReader, auditWriter, config: frameworkConfig, clock }),
  sessionGuard: createPreToolUseSessionGuardService({ stateReader, auditWriter, config: frameworkConfig, clock })
})

// CLI flow: stdin in, parse JSON, route hook, stdout out. The manifest forwards the
// event name (+ matcher) as CLI args — they are the authoritative dispatch signal
// (real harness payloads carry `hook_event_name`, not `hookType`). Fall back to the
// payload fields when args are absent (in-process/testing).
const [argEvent, argMatcher] = process.argv.slice(2)

let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

const payload = raw ? JSON.parse(raw) : {}
if (argEvent && payload.hookType == null && payload.hook_type == null && payload.type == null) {
  payload.hookType = argEvent
}
if (argMatcher && payload.toolName == null && payload.tool_name == null) {
  payload.toolName = argMatcher
}

const hookService = createHookService({ preToolUse, subagentStart, subagentStop, postToolUse })
const result = await hookService.handle(payload)

if (result !== undefined) {
  process.stdout.write(JSON.stringify(result))
}
