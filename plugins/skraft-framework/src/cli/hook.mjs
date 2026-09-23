#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createHookService } from '../adapters/api/hooks/service-factory.mjs'
import { toHarnessOutput } from '../adapters/api/hooks/harness-output.mjs'
import { fromHarnessInput } from '../adapters/api/hooks/harness-input.mjs'
import { createJsonlAuditWriter } from '../adapters/infrastructure/jsonl-audit-writer.mjs'
import { createSkillFileReader } from '../adapters/infrastructure/skill-file-reader.mjs'
import { createInstructionFileReader } from '../adapters/infrastructure/instruction-file-reader.mjs'
import { createJsonlTranscriptReader } from '../adapters/infrastructure/jsonl-transcript-reader.mjs'
import { createSubagentStartService } from '../application/subagent-start-service.mjs'
import { createSubagentStopService } from '../application/subagent-stop-service.mjs'
import { createPostToolUseService } from '../application/post-tool-use-service.mjs'
import { createPreToolUseService } from '../application/pre-tool-use-service.mjs'
import { createPreToolUseSessionGuardService } from '../application/pre-tool-use-session-guard-service.mjs'
import { createPreToolUseCompositeService } from '../application/pre-tool-use-composite.mjs'
import { createJsonStateReader } from '../adapters/infrastructure/json-state-reader.mjs'
import { resolvePluginRootFromEnv } from '../adapters/infrastructure/plugin-root-resolver.mjs'
import { resolveTrackingRoot } from '../adapters/infrastructure/tracking-root-resolver.mjs'
import { createActiveSlugStore } from '../adapters/infrastructure/active-slug-store.mjs'
import { firstValidProjectSlug } from '../domain/value-objects.mjs'
import { resolveAuditLogPath } from '../adapters/infrastructure/audit-log-resolver.mjs'

// Resolve the plugin root (US16): CLAUDE_PLUGIN_ROOT (harness-injected) →
// cache glob (~/.claude/plugins/cache/*/skraft/*) → module-relative fallback.
const pluginRoot = resolvePluginRootFromEnv({ moduleUrl: import.meta.url })
const configPath = process.env.SKRAFT_CONFIG ?? join(pluginRoot, 'skraft-framework.config.json')
const clock = { now: () => new Date().toISOString() }
// One audit log per project (SKRAFT_AUDIT_LOG, else the project's git directory), bound
// once the payload says where the session runs; the plugin's logs until then.
let auditWriter = createJsonlAuditWriter(resolveAuditLogPath({ cwd: process.cwd(), pluginRoot }))

// A write through a tool to a tracked pipeline state. When the hook itself fails, this
// is the one call it still refuses: every other tool call passes (a hook bug must never
// freeze the session), this one would corrupt the record the guards stand on.
const TRACKED_STATE_WRITE_RE = /skraft-plans[/\\][^"'\s]*state\.json/

const readStdin = async () => {
  let raw = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) raw += chunk
  return raw
}

// The session directory the harness reports (Claude Code and Copilot both send `cwd`);
// the process's own working directory only when the payload carries none.
const sessionCwd = (payload) =>
  typeof payload.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : process.cwd()

const compose = async (cwd) => {
  auditWriter = createJsonlAuditWriter(resolveAuditLogPath({ cwd, pluginRoot }))
  // Same tracking-root resolution as cli/state.mjs (SKRAFT_TRACKING_ROOT → layout →
  // default namespaced), anchored on the harness session directory.
  const trackingRoot = resolveTrackingRoot({ cwd })
  const skillFileReader = createSkillFileReader({ pluginsRoot: pluginRoot })
  const instructionFileReader = createInstructionFileReader({ pluginRoot })
  // Hooks never snapshot a corrupted state: the state CLI does, once, when it recovers.
  const stateReader = createJsonStateReader(trackingRoot, { snapshotCorrupted: false })

  // Load the pre-built framework config; fall back to empty config on error.
  let config = {}
  try { config = JSON.parse(await readFile(configPath, 'utf8')) }
  catch { /* fail-open: missing config means no mandatory skills, hooks still allow */ }

  const subagentStart = createSubagentStartService({ config, skillFileReader, instructionFileReader, auditWriter, clock })
  const subagentStop = createSubagentStopService({ config, transcriptReaderFactory: createJsonlTranscriptReader, auditWriter, clock })
  const postToolUse = createPostToolUseService({ auditWriter, clock, stateReader, config })
  // PreToolUse composite: G1 dispatch-order guard + G7/G8 session guard (see composite).
  const preToolUse = createPreToolUseCompositeService({
    dispatchGuard: createPreToolUseService({ stateReader, auditWriter, config, clock }),
    sessionGuard: createPreToolUseSessionGuardService({ stateReader, auditWriter, config, clock, trackingDir: basename(trackingRoot) })
  })
  return { trackingRoot, hookService: createHookService({ preToolUse, subagentStart, subagentStop, postToolUse }) }
}

// CLI flow: stdin in, parse JSON, route hook, stdout out. The manifest forwards the
// event name (+ matcher) as CLI args — they are the authoritative dispatch signal
// (real harness payloads carry `hook_event_name`, not `hookType`). Fall back to the
// payload fields when args are absent (in-process/testing).
const [argEvent, argMatcher] = process.argv.slice(2)
let raw = ''

try {
  raw = await readStdin()
  // Translate the harness wire vocabulary (lowercased tool names, JSON-encoded toolArgs)
  // into the framework vocabulary the services read — see adapters/api/hooks/harness-input.mjs.
  const payload = fromHarnessInput(raw ? JSON.parse(raw) : {})
  if (argEvent && payload.hookType == null && payload.hook_type == null && payload.type == null) {
    payload.hookType = argEvent
  }
  if (argMatcher && payload.toolName == null && payload.tool_name == null) {
    payload.toolName = argMatcher
  }

  const { trackingRoot, hookService } = await compose(sessionCwd(payload))
  // No harness sends a project slug: take the active pipeline the state CLI recorded,
  // unless SKRAFT_PROJECT_SLUG pins one. An invalid candidate is never joined into a path.
  payload.projectSlug = firstValidProjectSlug(
    payload.projectSlug,
    process.env.SKRAFT_PROJECT_SLUG,
    createActiveSlugStore(trackingRoot).read()
  ) ?? undefined

  const result = await hookService.handle(payload)

  // The services speak the framework's decision vocabulary; the harnesses do not. Translate
  // at this boundary (see adapters/api/hooks/harness-output.mjs) — an allow writes nothing.
  const hookEventName = argEvent ?? payload.hookType ?? payload.hook_event_name ?? payload.type
  const output = toHarnessOutput(result, hookEventName)
  if (output !== undefined) {
    process.stdout.write(JSON.stringify(output))
  }
} catch (error) {
  await auditWriter.write({
    eventType: 'HookFailed',
    hookEvent: argEvent ?? null,
    reason: error?.message ?? String(error),
    timestamp: clock.now()
  }).catch(() => {})
  if (argEvent === 'PreToolUse' && TRACKED_STATE_WRITE_RE.test(raw)) {
    const reason = 'the skraft hook failed; a tool write to a tracked state.json is refused until it recovers'
    process.stdout.write(JSON.stringify(toHarnessOutput({ decision: 'deny', message: reason }, 'PreToolUse')))
  }
}
