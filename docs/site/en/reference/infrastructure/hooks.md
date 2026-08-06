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
| `SessionStart` | Copilot session start | SKRAFT_* config check | 🚧 Coming |
| `SubagentStart` (orchestrator) | Orchestrator launches a sub-agent | Phase in order (G1) | 🚧 Coming |
| `SubagentStart` (worker) | Sub-agent launches a worker | Task scope bounded | 🚧 Coming |
| `PreToolUse` (engineer) | Before an engineer tool executes | No domain import from Infra; no forbidden network call | 🚧 Coming |
| `PreToolUse` (reviewer) | Before a reviewer tool executes | Reviewer is read-only (no writes) | 🚧 Coming |
| `PostToolUse` | After a tool executes | Audit-writer logs in JSONL | 🚧 Coming |
| `SubagentStop` | Sub-agent stops | Verdict emitted before stop | ✅ Scaffold |

`PreToolUse` and `SubagentStop` are the two events declared in
`.github/hooks/skraft.json` (US1 scaffold). Business handlers are to be implemented (US2+).

## Decision types

| Decision | Effect | When to use |
|----------|--------|-------------|
| `allow` | Tool executes normally | Payload compliant, no invariant violated |
| `deny` | Non-blocking refusal — agent may reformulate | Violation detected, recoverable |
| `block` | Immediate block — pipeline interrupted | Critical, unrecoverable violation |
| `additionalContext` | Tool executes but agent receives extra context | Warning or audit info |

### Response schema

```json
// allow
{ "decision": "allow" }
{ "decision": "allow", "message": "Payload valid" }

// deny
{ "decision": "deny", "message": "Reason for denial" }

// block
{ "decision": "block", "message": "Reason for block" }

// additionalContext
{ "decision": "additionalContext", "context": "Added information" }
```

If the hook returns `undefined` (no response) or exits 0 without output, the runtime
interprets it as `allow`.

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
| `plugins/skraft-framework/src/adapters/api/hooks/decision.mjs` | Decision constructors |
| `plugins/skraft-framework/src/adapters/api/hooks/hook-router.mjs` | Route by event type |
| `plugins/skraft-framework/src/adapters/api/hooks/hook-entry.mjs` | Normalise then route |
| `plugins/skraft-framework/src/adapters/api/hooks/service-factory.mjs` | Composition root |
| `plugins/skraft-framework/src/adapters/infrastructure/jsonl-audit-writer.mjs` | Append-only audit |
| `plugins/skraft-framework/src/application/config-loader.mjs` | Config cascade |
| `.github/hooks/skraft.json` | Hook declarations for the Copilot runtime |

## See also

- [Guardrails (hooks)]({{ "/en/explanation/hooks" | relative_url }}) — why hooks exist
- [Clean Architecture]({{ "/en/explanation/clean-architecture" | relative_url }}) — framework layers
