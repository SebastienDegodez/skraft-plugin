import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createHookService } from '../adapters/api/hooks/service-factory.mjs'
import { toHarnessOutput } from '../adapters/api/hooks/harness-output.mjs'
import { fromHarnessInput } from '../adapters/api/hooks/harness-input.mjs'
import { createJsonlAuditWriter } from '../adapters/infrastructure/jsonl-audit-writer.mjs'
import { createJsonStateReader } from '../adapters/infrastructure/json-state-reader.mjs'
import { resolvePluginRootFromEnv } from '../adapters/infrastructure/plugin-root-resolver.mjs'
import { resolveTrackingRoot } from '../adapters/infrastructure/tracking-root-resolver.mjs'
import { createActiveSlugStore } from '../adapters/infrastructure/active-slug-store.mjs'
import { firstValidProjectSlug } from '../domain/value-objects.mjs'
import { resolveAuditLogPath } from '../adapters/infrastructure/audit-log-resolver.mjs'
// A write through a tool to a tracked pipeline state. When the hook itself fails, this
// is the one call it still refuses: every other tool call passes (a hook bug must never
// freeze the session), this one would corrupt the record the guards stand on.
import { TRACKED_STATE_WRITE_RE } from '../domain/hook-relevance-policy.mjs'

// Resolve the plugin root (US16): CLAUDE_PLUGIN_ROOT (harness-injected) →
// cache glob (~/.claude/plugins/cache/*/skraft/*) → module-relative fallback.
const pluginRoot = resolvePluginRootFromEnv({ moduleUrl: import.meta.url })
const configPath = process.env.SKRAFT_CONFIG ?? join(pluginRoot, 'skraft-framework.config.json')
const clock = { now: () => new Date().toISOString() }
// One audit log per project (SKRAFT_AUDIT_LOG, else the project's git directory), bound
// once the payload says where the session runs; the plugin's logs until then.
let auditWriter = createJsonlAuditWriter(resolveAuditLogPath({ cwd: process.cwd(), pluginRoot }))


// The session directory the harness reports (Claude Code and Copilot both send `cwd`);
// the process's own working directory only when the payload carries none.
const sessionCwd = (payload) =>
  typeof payload.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : process.cwd()

// Each event loads only the services it routes to: a hook runs on every tool call, so
// the modules of the other events are never imported.
const SERVICES = {
  PreToolUse: async ({ config, stateReader, trackingRoot }) => {
    const [
      { createPreToolUseService },
      { createPreToolUseSessionGuardService },
      { createPreToolUseCompositeService },
      { createDispatchProvenanceService },
      { createHandoffGuardService },
    ] = await Promise.all([
      import('../application/pre-tool-use-service.mjs'),
      import('../application/pre-tool-use-session-guard-service.mjs'),
      import('../application/pre-tool-use-composite.mjs'),
      import('../application/dispatch-provenance-service.mjs'),
      import('../application/handoff-guard-service.mjs'),
    ])
    // PreToolUse composite: G1 dispatch order, G9 handoff, provenance and G7 (see composite).
    return {
      preToolUse: createPreToolUseCompositeService({
        dispatchGuard: createPreToolUseService({ stateReader, auditWriter, config, clock }),
        sessionGuard: createPreToolUseSessionGuardService({ auditWriter, clock, trackingDir: basename(trackingRoot) }),
        provenanceGuard: createDispatchProvenanceService({ config, auditWriter, clock }),
        handoffGuard: createHandoffGuardService({ stateReader, auditWriter, config, clock }),
      }),
    }
  },
  SubagentStart: async ({ config, stateReader }) => {
    const [{ createSkillFileReader }, { createSubagentStartService }, { createDispatchJournal }] = await Promise.all([
      import('../adapters/infrastructure/skill-file-reader.mjs'),
      import('../application/subagent-start-service.mjs'),
      import('../application/dispatch-journal-service.mjs'),
    ])
    const journal = createDispatchJournal({ auditWriter, stateReader, config, clock })
    const skillFileReader = createSkillFileReader({ pluginsRoot: pluginRoot })
    return { subagentStart: journal.started(createSubagentStartService({ config, skillFileReader, auditWriter, clock })) }
  },
  SubagentStop: async ({ config, stateReader }) => {
    const [{ createJsonlTranscriptReader }, { createSubagentStopService }, { createDispatchJournal }] = await Promise.all([
      import('../adapters/infrastructure/jsonl-transcript-reader.mjs'),
      import('../application/subagent-stop-service.mjs'),
      import('../application/dispatch-journal-service.mjs'),
    ])
    const journal = createDispatchJournal({ auditWriter, stateReader, config, clock })
    return { subagentStop: journal.stopped(createSubagentStopService({ config, transcriptReaderFactory: createJsonlTranscriptReader, auditWriter, clock })) }
  },
  PostToolUse: async ({ config, stateReader }) => {
    const { createPostToolUseService } = await import('../application/post-tool-use-service.mjs')
    return { postToolUse: createPostToolUseService({ auditWriter, clock, stateReader, config }) }
  },
}

const compose = async (cwd, hookEvent) => {
  auditWriter = createJsonlAuditWriter(resolveAuditLogPath({ cwd, pluginRoot }))
  // Same tracking-root resolution as cli/state.mjs (SKRAFT_TRACKING_ROOT → layout →
  // default namespaced), anchored on the harness session directory.
  const trackingRoot = resolveTrackingRoot({ cwd })
  // Hooks never snapshot a corrupted state: the state CLI does, once, when it recovers.
  const stateReader = createJsonStateReader(trackingRoot, { snapshotCorrupted: false })

  // Load the pre-built framework config; fall back to empty config on error.
  let config = {}
  try { config = JSON.parse(await readFile(configPath, 'utf8')) }
  catch { /* fail-open: missing config means no mandatory skills, hooks still allow */ }

  const services = SERVICES[hookEvent] ? await SERVICES[hookEvent]({ config, stateReader, trackingRoot }) : {}
  return { trackingRoot, hookService: createHookService(services) }
}

// CLI flow: parse JSON, route hook, stdout out. The entry point (hook.mjs) has already
// read stdin and decided the call can reach a guard. The event arg is the authoritative
// dispatch signal (real harness payloads carry `hook_event_name`, not `hookType`); a
// matcher arg, when a caller still passes one, names the tool a payload omits.
export const runHook = async ({ raw = '', argEvent, argMatcher } = {}) => {
  try {
    // Translate the harness wire vocabulary (lowercased tool names, JSON-encoded toolArgs)
    // into the framework vocabulary the services read — see adapters/api/hooks/harness-input.mjs.
    const payload = fromHarnessInput(raw ? JSON.parse(raw) : {})
    if (argEvent && payload.hookType == null && payload.hook_type == null && payload.type == null) {
      payload.hookType = argEvent
    }
    if (argMatcher && payload.toolName == null && payload.tool_name == null) {
      payload.toolName = argMatcher
    }

    const hookEvent = argEvent ?? payload.hookType ?? payload.hook_type ?? payload.hook_event_name ?? payload.hookEventName ?? payload.type

    const { trackingRoot, hookService } = await compose(sessionCwd(payload), hookEvent)
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
    const output = toHarnessOutput(result, hookEvent)
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
}
