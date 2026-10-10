---
layout: doc
lang: en
title: "Guardrails (hooks)"
description: "Why hooks make Engineer/Reviewer invariants mechanically unbreakable in SKRAFT."
sidebar_position: 18
---

# Guardrails — SKRAFT hooks

> "A contract is only worth what makes it mechanically unbreakable."
> — SKRAFT framework guiding principle

## The problem

In an agentic SDLC pipeline, critical invariants (no domain import from Infra layer,
append-only audit-writer, normalised payload) are documented in skills and ADRs. But
an agent can ignore them: nothing in the runtime enforces them mechanically.

Without guardrails, each pipeline phase exposes the invariant to silent drift.
Adversarial review detects violations *after* the fact; hooks detect them *before*.

## The solution — the hooks harness

SKRAFT targets runtime events in Claude Code and Copilot CLI; client validation limits
are stated below. Each hook intercepts an event (`PreToolUse`,
`SubagentStop`, …), evaluates the normalised payload, and returns a decision (`allow`,
`deny`, `block`, `additionalContext`).

```
harness runtime
      │
      ▼  PreToolUse (tool: bash, tool_input: …)
 hook.mjs ──► normalise(payload) ──► router ──► handler
                                                    │
                                          ┌─────────┤
                                        allow     deny / block
                                          │             │
                                          └──► toHarnessOutput(decision, event)
                                                    │
                                      execution     blocked
```

That decision vocabulary is SKRAFT's own — no harness understands it. It is translated on
the way out by `harness-output.mjs` into the JSON the runtimes actually validate: a refusal
before a tool travels as `permissionDecision: "deny"`, a refusal on any other event as
`decision: "block"`, and an allow as no output at all. One envelope carries both the root
keys Copilot reads and the `hookSpecificOutput` block Claude Code reads.

The translation is not cosmetic: a decision written in the internal vocabulary fails the
harness schema at the root, the whole payload is discarded, and the guard becomes a no-op
that lets the violation through. See
[Hooks — reference]({{ "/en/reference/infrastructure/hooks" | relative_url }}) for the exact
wire format.

Enforcement requires the host to load the hook and honor its decision. A translated
`deny` or `block` response alone does not prove that the host blocked execution.

## Framework structure

The framework lives under `plugins/skraft-framework/src/` at the repo root:

```
plugins/skraft-framework/src/
  domain/                ← pure policies (no IO)
    pipeline-policy.mjs        dispatch order (G1, checked by RunPipeline), provenance
    skill-policy.mjs           mandatory/on-demand skills, loads read from a transcript (G2, G3)
    phase-gate-policy.mjs      phase closure rules (G4, G5)
    session-guard-policy.mjs   tracked-state protection, shell and workspace reading (G7, G8)
    write-rights-policy.mjs    write rights per agent role, derived from the config (G8)
    handoff-policy.mjs         dispatch handoff completeness (G9, checked by RunPipeline)
    state-machine.mjs          transitions the state CLI applies
    result.mjs, value-objects.mjs, …

  ports/                 ← JSDoc contracts (duck-typed)
    api/                 inbound hook interfaces
    infrastructure/      outbound interfaces (audit writer, state, transcript…)

  application/           ← one service per hook concern
    pre-tool-use-composite.mjs   provenance and G7/G8 decisions
    write-rights-guard.mjs       G8, the use case the hook, the mod and the extension call
    subagent-start-service.mjs   G2
    subagent-stop-service.mjs    G3
    post-tool-use-service.mjs    G3 trace
    pipeline/run-pipeline.mjs    the pipeline itself, G1 and G9 before every dispatch
    state-service.mjs, phase-gate-service.mjs   the state CLI and its gate

  adapters/
    api/hooks/           ← harness boundary
      harness-input.mjs  harness payload → framework payload
      harness-output.mjs decision → harness wire format
      hook-router.mjs    routes by event
    infrastructure/      ← outbound implementations
      jsonl-audit-writer.mjs   append-only, never truncates
      audit-log-resolver.mjs   one audit log per project, in its git directory
      json-state-reader.mjs, state/json-state-writer.mjs
      …

  cli/
    hook.mjs             hook entry: stdin JSON → router → stdout JSON
    housekeeping.mjs     SessionStart entry
    state.mjs            the only writer of state.json
```

## Current packaging and validation limits

Installed plugin hooks share one canonical source but ship on two physical surfaces:

| Surface | Role |
|---|---|
| [Root hooks](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/hooks/hooks.json) | Canonical source and Claude compatibility |
| [Copilot namespace hooks](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/com.github.copilot/hooks/hooks.json) | Generated copy for Copilot v1; only the plugin-root token differs |

No extra manifest `hooks` pointers are needed. Both surfaces invoke the same shared runtime;
they are distribution adapters, not separate guardrail logic. The root source resolves through
`${CLAUDE_PLUGIN_ROOT}`; the generator rewrites that token to `${PLUGIN_ROOT}` in the Copilot
copy, because VS Code loads the v1 namespace copy and interpolates only `${PLUGIN_ROOT}` there.
Left literal, `${CLAUDE_PLUGIN_ROOT}` expands to nothing and node looks for `/src/cli/hook.mjs`
(`C:\src\cli\hook.mjs` under Windows PowerShell).
The canonical root manifest declares Agent Plugins v1 with no root `agents` list.
Exactly two editable runtime trees ship: 31 flat Copilot `.agent.md` files in
`com.github.copilot/agents/` and 31 flat native Claude `.md` files in
`com.anthropic.claude-code/agents/`. Body and description synchronize bidirectionally
against a per-side baseline; Markdown destinations translate without changing native headers.
`npm run plugin:sync` (`--apply`) and `npm run plugin:check` (`--check`) synchronize and verify
the pair. Conflicting prose edits block all writes. Both runtime trees, baseline and generated
hook copy are committed because marketplace Git installs do not run a build.

Actual **Copilot CLI 1.0.83** fixture tests **passed** namespaced agent discovery,
`SessionStart` and `PreToolUse` with `CLAUDE_PLUGIN_ROOT`, including paths with spaces.
[scripts/copilot-hook-smoke.mjs](https://github.com/SebastienDegodez/skraft-plugin/blob/main/scripts/copilot-hook-smoke.mjs)
also **passed** against the current migrated plugin installed from the local marketplace
checkout, with exact CLI **1.0.83** pinned via `--cli` and an isolated `COPILOT_HOME`:
**PASS allowed** (1 hook audit entry), **PASS denied** (1 hook audit entry), forbidden write
absent. This verifies the probed SKRAFT refusal, not the full six-root picker or
hidden-subagent invocation. Current **VS Code** source detects the v1 `$schema` first, then
falls back through `.plugin` then `.claude-plugin`; full live v1 validation is
**unverified**. These results do not support a blanket compatibility claim or the obsolete
no-schema workaround.

Sources: [adapter generator](https://github.com/SebastienDegodez/skraft-plugin/blob/main/scripts/project-plugin-adapters.mjs),
[CLI compatibility probe](https://github.com/SebastienDegodez/skraft-plugin/blob/main/scripts/copilot-plugin-compat-smoke.mjs)
and [current packaging notes](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/README.md#harness-packaging).
[ADR-009](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/adr/adr-009-generated-copilot-hook-copy.md)
records the current layout. [ADR-008](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/adr/adr-008-single-hook-manifest.md),
which it supersedes, preserves measured legacy evidence; it is not current cross-client packaging guidance.

## Starbucks example (illustrative)

*Illustrative example — invented for teaching, not derived from the codebase.*

Imagine the pipeline handles the story "pay for an order". The invariant is:
*no network call to the payment service in a test environment*.

With hooks:

1. `PreToolUse` receives `{ toolName: "bash", tool_input: { command: "curl https://pay.starbucks.com …" } }`
2. The handler detects the production URL → returns `deny("network call forbidden in CI")`
3. The agent receives the refusal before execution → reformulates its approach
4. The audit-writer logs the attempt as JSONL append-only

Without a hook, the call would pass silently; review would catch it *after*.

## Implementation status

| Guard | Enforced by | Failure mode | Live harness receipt |
|-------|-------------|--------------|----------------------|
| G1 dispatch order | RunPipeline, before every dispatch | Fail closed: the run stops `blocked` | Not a hook |
| Dispatch provenance | `PreToolUse` hook, Copilot extension (`onPreToolUse`) | Fail open | None |
| G2 mandatory skills | `SubagentStart` hook | Fail open | None |
| G3 skill loads | `PostToolUse` and `SubagentStop` hooks | Fail open | None |
| G4 phase artifacts | State CLI, when a phase closes | Fail closed | Not a hook |
| G5 verdict and DELIVER commit | State CLI, when a phase closes | Fail closed | Not a hook |
| G6 continuation | Removed: RunPipeline records what an agent returns | — | — |
| G7 tracked state | `PreToolUse` hook | Fail closed | Last recorded run: Copilot CLI 1.0.83 refused a shell write |
| G8 write rights per agent role | Claude Code mod (`tool.call`), Copilot extension (`onPreToolUse`), `PreToolUse` hook | Fail open on an unidentified caller; the mod and the extension refuse a write when the guard itself fails | None |
| G9 handoff completeness | RunPipeline, on the composed prompt | Fail closed: the run stops `blocked` | Not a hook |

Every guard is covered by unit and acceptance tests. A live receipt comes only from a real
session (`scripts/copilot-hook-smoke.mjs`, `scripts/claude-plugin-smoke.mjs`); Vally
evaluations do not load plugin hooks.

`SubagentStart` injects the starting agent's mandatory skills only. A skill declared
`on-demand` is not injected at start and is not required by `SubagentStop`; its eventual
read is still traced by G3. Rules are not injected: Copilot discovers path-scoped rules
natively.

The pipeline runs as code ([RunPipeline](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/run-pipeline.md),
ADR-010): a Claude Code mod and a Copilot dynamic workflow drive it. The guards that only
policed the prose orchestrator left the hooks. G1 (dispatch order) and G9 (handoff
completeness) run inside the use case before every dispatch, on the state it wrote itself;
a refusal stops the run before anything is sent. G6 (the PostToolUse reminder of what to
record next) is gone: the code records artefacts and verdicts. The hooks keep what no code
path can see — writes the agents make (G7, and G8 where neither the mod nor the extension
runs), skills they load (G2/G3), who dispatches whom (provenance).

## G8 — write rights per agent role

Each pipeline agent writes only what its role allows, so no agent works outside its perimeter
and a review stays independent of the code it reviews. `config:build` derives the rights from
the config — `phaseAgents`, `agentDispatchers`, the launcher and the outputs each agent
declares — into `writeRights` in `skraft-framework.config.json`; nothing is written per agent
in the code.

| Role | Who | May write |
|------|-----|-----------|
| Orchestrator | The pipeline launcher (`Skraft - Orchestrator`), and any agent that dispatches phase agents | Nothing: the pipeline's code writes state, reviews and reports |
| Reviewer | A phase reviewer | Its transmission files, the outputs it declares: its review (`reviews/{date}/{phase}-review-{N}.md`) and, in DELIVER, the patch, file list, commit list and `qg-verify` verdict its lenses read |
| Lens | An agent a reviewer dispatches | The outputs it declares — none for every pipeline lens |
| Specialist | A phase specialist | `src/` and `tests/` only in DISTILL (RED acceptance tests and their stubs) and DELIVER; anything else except another agent's transmission file |
| Worker | An agent a specialist dispatches | As its specialist |

An agent outside these roles (`general-purpose`, `Explore`, another plugin's) is not
governed, unless a governed agent spawned it: it then writes as that agent does. Agents outside
the pipeline (backlog, brownfield) are not governed. Inheritance needs a host that names the
spawner; where the host knows only part of the chain (Claude Code's settings hook names the
agent alone, Copilot without `parentId`), an ungoverned agent is unidentified. So an agent with
no right on `src/` and `tests/` — orchestrator, reviewer, lens, RESEARCH or DESIGN specialist —
starts only the agents the dispatch tree declares for it: provenance refuses it any agent
without a declared dispatcher (`UNDECLARED_DISPATCH`), on every host.

The guard reads what a call writes: the file a file tool names (`apply_patch`: every file its
headers name), and the files a shell command writes, read as G7 reads it. `src/` and `tests/` are
those of the project the session runs in: a path under the session directory is read from
there, so a project kept in `~/src` is not all workspace. A transmission file is read from the
tracking root (`SKRAFT_TRACKING_ROOT`, or `.copilot-tracking/skraft-plans` under the session
directory), never from another `skraft-plans` directory.

**A line read to the end, or refused.** An agent with no right on `src/` and `tests/` runs only
shell lines the guard can read to the end; any other is refused:

- a here-document or standard input fed to a program outside the input-only allowlist (`cat`,
  `grep`, `jq`, `git commit`, the framework's CLIs…), `eval`, `source`, a shell behind a wrapper
  (`env`, `sudo`, `timeout`…) or run on a script, an inline interpreter script (`node -e`);
- a PowerShell command other than a reading cmdlet (`Get-*`, `Select-String`…), and text typed
  into a running program (Copilot's `write_bash`);
- a path it cannot resolve (`$(…)`, an unset variable) or a glob, wherever it could land; the
  session directory and its ancestors hold `src/` and `tests/` (`rm -rf .`, `git checkout .`).

`git apply`, `am`, `merge`, `pull`, `cherry-pick`, `revert`, `rebase`, `stash pop`, `switch`,
`checkout` without `--`, `reset --hard`, `patch` fed a diff, `tar -x` and `unzip` rewrite the
directory they run in; a framework CLI's `--out PATH` writes PATH. Only the bare null device
(`/dev/null`, `nul`, `\\.\nul`) is no write. The verdict here-document, `git diff > …patch` and
`git commit -F -` stay readable. For every role, a path the line cannot resolve counts as a
reviewer's file when its last segment can be that file's name, and a directory copied or moved
into the tracking root counts as written there.

**Who calls.** Each host says it, and the one use case (`write-rights-guard.mjs`) judges:

| Host | Where G8 runs | How the caller is known |
|------|---------------|-------------------------|
| Claude Code with mods | The mod's `tool.call` hook on `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Bash` | The call's `agentId` and `$.agent.list()` (its type and who spawned it); the main loop's `agent_type` under `--agent`, from `SessionStart` |
| Copilot CLI and Copilot app | The extension's `onPreToolUse` session hook, which also sees the sub-agents' calls (`create`, `edit`, `str_replace_editor`, `apply_patch`, `bash`, `powershell`, `write_bash`, `task`) | A sub-agent's `sessionId` matched to the `toolCallId` of the `subagent.started` event the runtime sent (`agentName`), its spawners followed by `parentId`; the main session's selected agent (`agent.getCurrent`, `subagent.selected`). The event's `agentId` names the emitter, never the started agent. No file is read |
| Any host, settings hook | `PreToolUse` in `hooks.json` | The payload's agent name: Claude Code's `agent_type`; Copilot's `preToolUse` names none |

An **unidentified caller passes** (fail-open), audited `UNIDENTIFIED_CALLER`: a Copilot settings
hook, a sub-agent no event announced, a main session whose selection could not be read, an
ungoverned agent whose spawner the host cannot name (an ambiguous mapping is never read as
another agent: Copilot SDK 1.0.9 sends no `parentId`, so the main session is never assumed). G8
refuses only a write it can attribute to a role that lacks the right; refusing the unnamed
would refuse the Software Engineer with everyone else (#206). A Claude Code payload that names
no agent comes from the main session without `--agent`, which no pipeline agent runs.

**Fail mode.** The mod and the extension refuse a write when the guard itself fails (a `.catch`
that refuses, a caught error); the settings hook keeps its rule: a hook failure lets the call
pass, except a tool write to a tracked `state.json`.

**Batches.** Each call of a Copilot `toolCalls` batch is judged; one refusal refuses the batch.

**What G8 does not read.** A program run on a script file (`node script.mjs`, `npm run`) writes
what the script does: the guard reads the line, not the script. The Software Engineer and the
DISTILL and DELIVER agents keep their shell: an unreadable line is not refused to them, and a
rewrite of the session directory (`git reset --hard`) is not judged against the reviews. A
PowerShell line is read as a POSIX line, its `$null` as the null device.

**What still needs the settings hook.** G7, provenance, and G8 for a host that runs neither the
mod nor the extension: Claude Code without mods, a Copilot host that does not load the plugin's
extension (VS Code reads the v1 hooks), a session where the extension did not load. On Claude Code with mods
both run and agree; the mod answers first.

## Token economy — the hook angle

Hooks contribute to the pipeline's [token economy]({{ "/en/explanation/token-economy" | relative_url }})
through two levers of the Genesis discipline.

### Deterministic enforcement = zero reasoning tokens

Without a hook, the agent must *reason* about each invariant at every tool call:
"should I normalise this payload?", "is this audit-writer really append-only?".
Each check is a reasoning chain emitted as output, turn after turn.

With a `PreToolUse` hook, enforcement is **native code**: exit 0 or a JSON
`deny`/`allow` response, with zero reasoning tokens. The decision leaves the model's path.

### Stable prefix = KV-cache eligible

Because the invariant is held by the hook's code and not re-injected as prose into the
context every turn, the **system prefix stays stable** between calls. A stable prefix
remains KV-cache eligible — the lever that produces the largest *measured* token
reduction in the pipeline. As soon as an invariant is rewritten into the prompt at every
tool call, the prefix shifts and the cache misses.

> The measured reduction ratios (cache, model class) are documented on the
> [Token economy]({{ "/en/explanation/token-economy" | relative_url }}) page.

## What hooks do not cover

Hooks and the state CLI enforce **structural and behavioural invariants** — dispatch
order, artifact presence, reviewer verdict, state-file integrity. They are not a general
anti-hallucination system, and two important limits must be stated explicitly.

### G2 and G3 enforce declared methodology, not truth

Guardrail G2 injects mandatory skills at `SubagentStart`. G3 records skill reads and
sends a subagent back when its transcript shows no load of a mandatory skill: a skill tool
call or a read of its `SKILL.md`, never a mention. Skills marked `on-demand` are outside
that mandatory set, so they do not trigger a start injection or a stop-time compliance
block. Both fail open on hook failure so an internal runtime error cannot freeze the
pipeline. They prove a skill was loaded, not that the agent applied it correctly.

### Structural violations vs. factual hallucinations

Hooks detect **quality hallucinations**: a missing artifact, an out-of-order
dispatch, a verdict that does not match the written file. They do not detect
**factual hallucinations**: a business rule invented by the model, a non-existent
API endpoint cited in the code, or incorrect domain knowledge embedded in a test.
Factual correctness remains the responsibility of the human reviewer and of
domain-specific acceptance tests.

## Further reading

- [Token economy]({{ "/en/explanation/token-economy" | relative_url }}) — the Genesis levers and the measured reduction ratios

- [Hooks reference]({{ "/en/reference/infrastructure/hooks" | relative_url }}) — events and guards, the phase gate, decisions, environment variables
- [Clean Architecture]({{ "/en/explanation/clean-architecture" | relative_url }}) — Api → Infra → Application → Domain layers
