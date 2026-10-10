---
layout: doc
lang: en
title: "Hooks — reference"
description: "Factual catalogue of SKRAFT hook events, decision types, and SKRAFT_* config."
sidebar_position: 1
---

# Hooks — reference

## Hook events

| Hook | Tool | Guard | What it enforces | On internal failure |
|------|---------|-------|------------------|---------------------|
| `SessionStart` | — | — | Exports `SKRAFT_PLUGIN_ROOT` to later Bash calls (Claude Code, through `CLAUDE_ENV_FILE`); states the plugin path and the active pipeline in the session context; trims the audit log and purges stale state signals | Allow |
| `SubagentStart` | — | G2 | Tells the starting agent which skills are mandatory (`verify` or `eager`); inlines the `eager` ones; excludes `on-demand` skills | Allow |
| `PreToolUse` | `Agent`, `Task` | Provenance | No agent dispatches itself; an agent with a declared dispatcher is dispatched by that agent alone; an agent with no right on `src/` and `tests/` (orchestrator, reviewer, lens, RESEARCH or DESIGN specialist) starts no agent without a declared dispatcher (`UNDECLARED_DISPATCH`) | Allow |
| `PreToolUse` | `Bash`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `ApplyPatch`, `StrReplaceEditor`, `WriteBash` | G7 | No direct write to a pipeline's `state.json`, its execution log or the `.active-slug` pointer, whatever the phase | Deny when the file, or a shell command read as the shell reads it, writes or removes a tracked `state.json` |
| `PreToolUse` | same | G8 | A write stays within the caller's write rights (`writeRights` in the framework config): the orchestrator writes nothing, a reviewer or a lens only its declared transmission files, a specialist or a worker `src/` and `tests/` only in DISTILL and DELIVER and never another agent's transmission file. The caller is the payload's agent name (Claude Code's `agent_type`), without its spawners; a caller the payload does not name, or an ungoverned one, passes, audited `UNIDENTIFIED_CALLER` | Allow |
| `PostToolUse` | `Read` | G3 | Each `SKILL.md` read is written to the audit log | Allow |
| `SubagentStop` | — | G3 | A subagent whose transcript shows no load of a mandatory skill (a skill tool call, or a read of its `SKILL.md`) is sent back; `on-demand` skills are not mandatory; one already sent back is let go | Allow |

G1 (dispatch order), G6 (continuation) and G9 (handoff) are no longer hooks: the pipeline
runs as code (RunPipeline, ADR-010), which checks G1 and G9 before every dispatch and records
what each agent returns. See `docs/run-pipeline.md` in the repository.

G8 also runs outside the settings hooks, where the host names the caller in code, with the
same use case (`application/write-rights-guard.mjs`):

| Host | Entry | Caller | When the guard fails |
|------|-------|--------|----------------------|
| Claude Code with mods | `hooks/skraft-mod.mjs`, `tool.call` on `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Bash` | `agentId` → `$.agent.list()` (type, parent, `spawnedBy`); main loop: `SessionStart`'s `agent_type` | Refuses the call |
| Copilot CLI, Copilot app | `com.github.copilot/extensions/skraft-pipeline/extension.mjs`, `hooks.onPreToolUse`; it runs provenance on `task` too | Hook input `sessionId` → the `toolCallId` of a `subagent.started` (`agentName`), spawners by `parentId` (absent in SDK 1.0.9: the chain is then incomplete); main session: `agent.getCurrent`, `subagent.selected` / `subagent.deselected`. The envelope's `agentId` names the emitter and is never a key | Refuses a write or an agent start; any other call passes |

A refusal reads `skraft G8: <reason>`; the extension audits it (`SessionGuardEvaluated`,
`source: copilot-extension`), the settings hook audits every judged call inside a pipeline
with its code: `WRITE_RIGHT_DENIED`, `CONFORMING`, `NOT_GOVERNED` (an agent outside the
rights whose whole chain the host names), `UNIDENTIFIED_CALLER` (no caller, or an ungoverned
one whose spawner the host cannot name), `NO_WRITE`.

Both plugin manifests carry the same entries, and every entry runs `src/cli/hook.mjs`
(`src/cli/housekeeping.mjs` for `SessionStart`). Copilot CLI sends its own tool names
(`bash`, `create`, `str_replace`, `view`, …); `adapters/api/hooks/harness-input.mjs` maps
them to the names above before any guard runs: `apply_patch` → `ApplyPatch` (its patch, sent as
bare text or as `input`), `str_replace_editor` → `StrReplaceEditor`, `write_bash` → `WriteBash`,
`powershell` → `Bash` (`$null` and `| Out-Null` read as the null device), `task`'s
`agent_type` → the requested agent. A Copilot `toolCalls` batch is guarded call
by call; one refused call refuses the batch.

Each tool event has one entry with no matcher: VS Code ignores matchers and would run every
entry of an event on every tool call. `src/cli/hook.mjs` reads the tool name from the payload
and returns before loading any guard when the call involves none of the tools above.

G7 and G8 read a shell command the way the shell splits it
(`domain/shell-command-reading.mjs`): quotes and escapes removed (`'state.json'`,
`"state".json`, `state\.json`), variables the line assigns substituted, `cd` and
`pushd` followed from the session directory the hook reports, and the commands run by
`$( )`, backticks, `sh -c`, `eval`, `env -S`, `find -exec` and `xargs` read too. They
recognise redirections, `tee`, rewriting, removing and copying verbs (including `cp -t`
and a directory destination), in-place `sed`, `perl` and `awk`, inline `node -e` or
`python -c` scripts, `git checkout`, `restore`, `rm`, `mv` and `clean`, and `find
-delete`, behind assignments, shell keywords and wrappers with their options (`sudo -u`,
`env -u`, `timeout 5`…). Removing a directory that holds the tracked state, or a glob
that can name it, counts. A path G7 cannot resolve (an unknown variable or directory)
counts when it ends in a protected file name.

Still not seen: aliases, shell functions defined in an earlier command, scripts run from a
file (`bash x.sh`, `source x`), and programs that write the file on their own. A PowerShell
line is read as a POSIX line.

For G8, the shell reading also knows `git apply`, `am`, `merge`, `pull`, `cherry-pick`,
`revert`, `rebase`, `stash` (but `list`, `show`), `switch`, `checkout` without `--` and
`reset --hard` / `--merge` / `--keep` (they rewrite the directory they run in), `patch` (its
file, `-o`, or the directory a diff fed to it lands in), `tar -x`, `unzip` and a CLI's `--out
PATH`. A here-document is dropped only when every command of its pipeline reads its input as
data (`cat`, `grep`, `jq`, `git commit`, the framework's CLIs…); otherwise it is read as
commands. A path under the session directory is read from there: `src/` and `tests/` are the
project's; transmission files are read from the tracking root. Only `/dev/null`, `/dev/std*`,
`/dev/fd/N`, a bare `nul` and `\\.\nul` are devices.

An agent with no right on `src/` and `tests/` is refused a line `shellOpacity`
(`domain/session-guard-policy.mjs`) cannot read to the end: a program fed a here-document or
its standard input outside that allowlist, `eval`, `source`, `env -S`, a shell behind a
wrapper or run on a script, an inline interpreter script, a PowerShell command other than a
reading cmdlet, `WriteBash` input. Its unresolved paths and globs count wherever they could
land, and the session directory and its ancestors hold `src/` and `tests/`.

## Skill policies

| Policy | G2 startup injection | G3 stop compliance | G3 read trace |
|--------|----------------------|--------------------|---------------|
| `verify` | Listed as mandatory | Required | Yes |
| `eager` | Listed as mandatory and inlined | Required | Yes |
| `on-demand` | Not injected | Not required | Yes |

## Phase gate (state CLI, G4/G5)

Phase completion is not a hook. The orchestrator records artifacts and verdicts after a
subagent returns, so the check runs when the phase closes: `state.mjs transition` and
`state.mjs close-phase` refuse with `PHASE_GATE` unless

- **G4** — every required tracked output of the phase is recorded and present on disk;
- **G5** — the deciding review artifact is recorded and present, its verdict equals the
  recorded verdict, and a closing DELIVER phase has a commit since the phase started.

The gate fails closed: a phase that cannot be checked does not close.

## State CLI handoff and timing

| Subcommand | Output |
|------------|--------|
| `handoff --agent <name>` | Markdown handoff block for the next phase-agent dispatch: required inputs resolved to recorded paths, context inputs, artefacts under review, previous review and previous outputs on retry |
| `timeline` | Per-phase durations from the dispatch journal: specialist time, reviewer time, other subagents, attempts, skill-compliance blocks and mutation runs |

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
| `plugins/skraft-framework/src/cli/state.mjs` | State CLI, including the phase gate, handoff block and timeline |
| `plugins/skraft-framework/src/adapters/api/hooks/harness-input.mjs` | Harness payload → framework payload |
| `plugins/skraft-framework/src/adapters/api/hooks/payload.mjs` | Payload normalisation |
| `plugins/skraft-framework/src/adapters/api/hooks/decision.mjs` | Decision constructors (internal vocabulary) |
| `plugins/skraft-framework/src/adapters/api/hooks/harness-output.mjs` | Decision → harness wire format |
| `plugins/skraft-framework/src/adapters/api/hooks/hook-router.mjs` | Route by event type |
| `plugins/skraft-framework/src/application/pre-tool-use-composite.mjs` | Provenance and G7/G8 on `PreToolUse` |
| `plugins/skraft-framework/src/application/write-rights-guard.mjs` | G8 use case: write rights of the caller, call by call |
| `plugins/skraft-framework/src/domain/write-rights-policy.mjs` | Write rights derived from the config (`config:build`) and judged on a write |
| `plugins/skraft-framework/src/adapters/api/copilot-workflow/copilot-write-guard.mjs` | G8 on Copilot: caller registry from session events, `onPreToolUse` handler |
| `plugins/skraft-framework/src/domain/pipeline-policy.mjs` | Dispatch order (G1, checked by RunPipeline), provenance |
| `plugins/skraft-framework/src/domain/handoff-policy.mjs` | Required-input handoff manifest and G9 evaluation (checked by RunPipeline) |
| `plugins/skraft-framework/src/domain/session-guard-policy.mjs` | Tracked-state protection; shell and workspace reading for G7 and G8 |
| `plugins/skraft-framework/src/domain/skill-policy.mjs` | Mandatory and `on-demand` skill policy |
| `plugins/skraft-framework/src/domain/phase-gate-policy.mjs` | Phase closure rules |
| `plugins/skraft-framework/src/adapters/infrastructure/jsonl-audit-writer.mjs` | Append-only audit |

## See also

- [Guardrails (hooks)]({{ "/en/explanation/hooks" | relative_url }}) — why hooks exist
- [Clean Architecture]({{ "/en/explanation/clean-architecture" | relative_url }}) — framework layers
