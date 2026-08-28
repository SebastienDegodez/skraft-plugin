---
layout: doc
lang: en
title: "Hooks — reference"
description: "Factual catalogue of SKRAFT hook events, decision types, and SKRAFT_* config."
sidebar_position: 1
---

# Hooks — reference

## Hook events

| Hook | Trigger | Associated SKRAFT invariant | Status |
|------|---------|-----------------------------|--------|
| `SessionStart` | Session starts | Housekeeping and stale-state signals | ✅ Delivered |
| `SubagentStart` | Sub-agent starts | Mandatory skills; Claude companion rules (G2) | ✅ Delivered |
| `PreToolUse` (`Agent`) | Before agent dispatch | Phase order and session guard (G1/G8) | ✅ Delivered |
| `PreToolUse` (`Bash`) | Before a shell tool executes | State protection (G7) | ✅ Delivered |
| `PostToolUse` (`Read`) | After a file read | Skill audit (G3) | ✅ Delivered |
| `PostToolUse` (`Agent`) | After agent dispatch | Orchestrator continuation (G6) | ✅ Delivered |
| `SubagentStop` | Sub-agent stops | Artifact, verdict, and commit checks (G4/G5) | ✅ Delivered |

Harness manifests expose the event subset each runtime supports. All entries route to the
same `src/cli/hook.mjs` composition root.

## Decision types (internal vocabulary)

Handlers return one of four decisions, built by
`plugins/skraft-framework/src/adapters/api/hooks/decision.mjs`:

| Decision | Effect | When to use |
|----------|--------|-------------|
| `allow` | Tool executes normally | Payload compliant, no invariant violated |
| `deny` | Non-blocking refusal — agent may reformulate | Violation detected, recoverable |
| `block` | Immediate block — pipeline interrupted | Critical, unrecoverable violation |
| `additionalContext` | Tool executes but agent receives extra context | Warning or audit info |

```js
allow()                                  // { decision: 'allow' }
deny('Reason for denial')                // { decision: 'deny', message: … }
block('Reason for block')                // { decision: 'block', message: … }
additionalContext('Added information')   // { decision: 'additionalContext', context: … }
```

**This vocabulary never reaches the harness.** It is the framework's own language,
translated at the CLI boundary by
`plugins/skraft-framework/src/adapters/api/hooks/harness-output.mjs`.

## Harness wire format (what is actually written to stdout)

Both harnesses type the root `decision` key as `"approve" | "block"`. Writing
`{"decision":"allow"}` or `{"decision":"deny"}` invalidates the **whole** payload — Claude
Code logs `Hook JSON output validation failed — (root): Invalid input`, discards the output
and lets the tool run. A guard emitting the internal vocabulary is therefore inert.

A single envelope satisfies both runtimes: Claude Code reads `hookSpecificOutput` and drops
unknown root keys, Copilot CLI reads the root keys and ignores `hookSpecificOutput`.

| Decision | Event | stdout |
|----------|-------|--------|
| `allow` | any | *(nothing — empty stdout is never parsed, so it can never fail validation)* |
| `deny` / `block` | `PreToolUse` | `permissionDecision` + `permissionDecisionReason`, at the root **and** inside `hookSpecificOutput` |
| `deny` / `block` | any other | `{ "decision": "block", "reason": … }` |
| `additionalContext` | any | `additionalContext` at the root **and** inside `hookSpecificOutput` |

```json
// deny / block on PreToolUse — the tool alone is refused, the session keeps going
{
  "permissionDecision": "deny",
  "permissionDecisionReason": "Reason for denial",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Reason for denial"
  }
}

// deny / block on any other event
{ "decision": "block", "reason": "Reason for block" }

// additionalContext
{
  "additionalContext": "Added information",
  "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "Added information" }
}
```

`hookSpecificOutput.hookEventName` **must** match the event currently running, otherwise
Claude Code drops the block. A `block` on `PreToolUse` maps onto `permissionDecision: "deny"`
and never `continue: false`: a hook bug must not freeze the pipeline.

If the hook writes nothing or exits 0 without output, both runtimes interpret it as `allow`.

## Payload normalisation

All incoming payloads are normalised to camelCase before routing:

| Incoming format | Result |
|----------------|--------|
| `tool_name` (snake_case) | `toolName` |
| `ToolName` (PascalCase) | `toolName` |
| `toolName` (camelCase) | `toolName` (unchanged) |
| `File_Path` (mixed) | `filePath` |

Implemented in `plugins/skraft-framework/src/adapters/api/hooks/payload.mjs`.

## SKRAFT_* config and cascade

The config-loader (`plugins/skraft-framework/src/application/config-loader.mjs`) resolves configuration
using the following cascade (last source wins):

```
1. SKRAFT_* environment variables    (lowest priority)
2. ~/.skraft/config.json             (user global config)
3. .skraftrc.json or skraft.config.json  (project config, highest priority)
```

### Supported configuration keys

| Env variable | Config key | Description |
|-------------|------------|-------------|
| `SKRAFT_LOG_LEVEL` | `logLevel` | Log level (`debug`, `info`, `warn`, `error`) |
| `SKRAFT_TIMEOUT` | `timeout` | Timeout in seconds |
| `SKRAFT_MODE` | `mode` | Execution mode (`production`, `test`) |

*The list is extensible — any `SKRAFT_*` variable is converted to a camelCase key.*

## Source files

| File | Role |
|------|------|
| `plugins/skraft-framework/src/cli/hook.mjs` | CLI entry point (stdin → stdout) |
| `plugins/skraft-framework/src/adapters/api/hooks/payload.mjs` | Payload normalisation |
| `plugins/skraft-framework/src/adapters/api/hooks/decision.mjs` | Decision constructors (internal vocabulary) |
| `plugins/skraft-framework/src/adapters/api/hooks/harness-output.mjs` | Decision → harness wire format |
| `plugins/skraft-framework/src/adapters/api/hooks/hook-router.mjs` | Route by event type |
| `plugins/skraft-framework/src/adapters/api/hooks/hook-entry.mjs` | Normalise then route |
| `plugins/skraft-framework/src/adapters/api/hooks/service-factory.mjs` | Composition root |
| `plugins/skraft-framework/src/adapters/infrastructure/jsonl-audit-writer.mjs` | Append-only audit |
| `plugins/skraft-framework/src/application/config-loader.mjs` | Config cascade |
| `.github/hooks/skraft.json` | Hook declarations for the Copilot runtime |

## See also

- [Guardrails (hooks)]({{ "/en/explanation/hooks" | relative_url }}) — why hooks exist
- [Clean Architecture]({{ "/en/explanation/clean-architecture" | relative_url }}) — framework layers
