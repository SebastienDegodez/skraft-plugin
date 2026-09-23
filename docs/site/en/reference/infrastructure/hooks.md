---
layout: doc
lang: en
title: "Hooks — reference"
description: "Factual catalogue of SKRAFT hook events, decision types, and SKRAFT_* config."
sidebar_position: 1
---

# Hooks — reference

## Hook events

| Hook | Matcher | Guard | What it enforces | On internal failure |
|------|---------|-------|------------------|---------------------|
| `SessionStart` | — | — | Exports `SKRAFT_PLUGIN_ROOT` to later Bash calls (Claude Code, through `CLAUDE_ENV_FILE`); states the plugin path and the active pipeline in the session context; trims the audit log and purges stale state signals | Allow |
| `SubagentStart` | — | G2 | Tells the starting agent which skills are mandatory; inlines the `eager` ones | Allow |
| `PreToolUse` | `Agent`, `Task` | G1 | A phase agent is dispatched only when the recorded phase allows it: the specialist in the open phase, its reviewer once an artifact is recorded | Block, for a phase agent |
| `PreToolUse` | `Agent`, `Task` | Provenance | No agent dispatches itself; an agent with a declared dispatcher is dispatched by that agent alone | Allow |
| `PreToolUse` | `Bash`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | G7 | No direct write to a pipeline's `state.json`, its execution log or the `.active-slug` pointer, whatever the phase | Deny when the payload names a tracked `state.json` |
| `PreToolUse` | same | G8 | During DELIVER, `src/` and `tests/` are written only by the DELIVER agents and the agents they dispatch | Allow |
| `PostToolUse` | `Agent`, `Task` | G6 | After a phase agent returns, the orchestrator is told what to record and what to dispatch next | Allow |
| `PostToolUse` | `Read` | G3 | Each `SKILL.md` read is written to the audit log | Allow |
| `SubagentStop` | — | G3 | A subagent whose transcript shows no load of a mandatory skill (a skill tool call, or a read of its `SKILL.md`) is sent back; one already sent back is let go | Allow |

Both plugin manifests carry the same entries, and every entry runs `src/cli/hook.mjs`
(`src/cli/housekeeping.mjs` for `SessionStart`). Copilot CLI sends its own tool names
(`bash`, `create`, `str_replace`, `view`, …); `adapters/api/hooks/harness-input.mjs` maps
them to the names above before any guard runs.

G7 and G8 read a shell command by its form: redirections, `tee`, rewriting and copying
verbs, in-place `sed` and `perl`, inline `node -e` or `python -c` scripts, behind
`VAR=value` assignments and wrappers such as `sudo` or `env`. A write hidden behind
`bash -c`, a variable, a subshell or `find -delete` is not recognised.

## Phase gate (state CLI, G4/G5)

Phase completion is not a hook. The orchestrator records artifacts and verdicts after a
subagent returns, so the check runs when the phase closes: `state.mjs transition` and
`state.mjs close-phase` refuse with `PHASE_GATE` unless

- **G4** — every required tracked output of the phase is recorded and present on disk;
- **G5** — the deciding review artifact is recorded and present, its verdict equals the
  recorded verdict, and a closing DELIVER phase has a commit since the phase started.

The gate fails closed: a phase that cannot be checked does not close.

## Verification status

Every guard above is covered by unit and acceptance tests under `tests/skraft-framework/`.
A live harness run is a separate receipt: `scripts/copilot-hook-smoke.mjs` and
`scripts/claude-plugin-smoke.mjs` drive a real session through one allowed shell command and
one G7 refusal. The last recorded pass is Copilot CLI 1.0.83 for those two probes; the other
guards have no live receipt, and Vally evaluations do not load plugin hooks.

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

## Environment variables

The hooks and the CLIs read these variables; none is required.

| Variable | Effect | Default |
|----------|--------|---------|
| `SKRAFT_PLUGIN_ROOT` | Plugin location for agents' shell commands; exported by `SessionStart` | Set by the hook on Claude Code; stated in the session context on both harnesses |
| `SKRAFT_PROJECT_SLUG` | Pipeline the hooks and CLIs act on | The recorded `.active-slug` pointer |
| `SKRAFT_TRACKING_ROOT` | Absolute directory holding every pipeline's state | `.copilot-tracking/skraft-plans` under the working directory |
| `SKRAFT_AUDIT_LOG` | Audit log file | `skraft/skill-audit.jsonl` in the project's git directory, else the plugin's `logs/` |
| `SKRAFT_CONFIG` | Framework config (`skraft-framework.config.json`) | The one beside the runtime |
| `SKRAFT_CONFIG_ROOT` | Directory of the repository config `skraft-config.json` | The working directory |
| `SKRAFT_HARNESS` | Forces the payload dialect (`claude-code` or `copilot`) | Detected from the payload |

`src/application/config-loader.mjs` implements an `env → ~/.skraft/config.json →
.skraftrc.json` cascade, but no hook or CLI reads it.

## Source files

| File | Role |
|------|------|
| `plugins/skraft-framework/hooks/hooks.json` | Canonical hook manifest |
| `plugins/skraft-framework/com.github.copilot/hooks/hooks.json` | Generated copy for Copilot v1 |
| `plugins/skraft-framework/src/cli/hook.mjs` | CLI entry point (stdin → stdout) |
| `plugins/skraft-framework/src/cli/housekeeping.mjs` | `SessionStart` entry point |
| `plugins/skraft-framework/src/cli/state.mjs` | State CLI, including the phase gate |
| `plugins/skraft-framework/src/adapters/api/hooks/harness-input.mjs` | Harness payload → framework payload |
| `plugins/skraft-framework/src/adapters/api/hooks/payload.mjs` | Payload normalisation |
| `plugins/skraft-framework/src/adapters/api/hooks/decision.mjs` | Decision constructors (internal vocabulary) |
| `plugins/skraft-framework/src/adapters/api/hooks/harness-output.mjs` | Decision → harness wire format |
| `plugins/skraft-framework/src/adapters/api/hooks/hook-router.mjs` | Route by event type |
| `plugins/skraft-framework/src/application/pre-tool-use-composite.mjs` | G1, provenance and G7/G8 on `PreToolUse` |
| `plugins/skraft-framework/src/domain/pipeline-policy.mjs` | Dispatch order, provenance, continuation |
| `plugins/skraft-framework/src/domain/session-guard-policy.mjs` | Tracked-state protection and DELIVER writes |
| `plugins/skraft-framework/src/domain/phase-gate-policy.mjs` | Phase closure rules |
| `plugins/skraft-framework/src/adapters/infrastructure/jsonl-audit-writer.mjs` | Append-only audit |

## See also

- [Guardrails (hooks)]({{ "/en/explanation/hooks" | relative_url }}) — why hooks exist
- [Clean Architecture]({{ "/en/explanation/clean-architecture" | relative_url }}) — framework layers
