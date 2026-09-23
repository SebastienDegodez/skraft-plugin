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
    pipeline-policy.mjs        dispatch order, provenance, continuation (G1, G6)
    skill-policy.mjs           mandatory skills, loads read from a transcript (G2, G3)
    phase-gate-policy.mjs      phase closure rules (G4, G5)
    session-guard-policy.mjs   tracked-state protection, DELIVER writes (G7, G8)
    state-machine.mjs          transitions the state CLI applies
    result.mjs, value-objects.mjs, …

  ports/                 ← JSDoc contracts (duck-typed)
    api/                 inbound hook interfaces
    infrastructure/      outbound interfaces (audit writer, state, transcript…)

  application/           ← one service per hook concern
    pre-tool-use-composite.mjs   G1, provenance and G7/G8, combined fail-closed
    subagent-start-service.mjs   G2
    subagent-stop-service.mjs    G3
    post-tool-use-service.mjs    G3 trace, G6
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
| [Copilot namespace hooks](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/com.github.copilot/hooks/hooks.json) | Generated exact byte copy for Copilot v1 |

No extra manifest `hooks` pointers are needed. Both surfaces invoke the shared runtime
through `CLAUDE_PLUGIN_ROOT`; they are distribution adapters, not separate guardrail logic.
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
hidden-subagent invocation. **VS Code 1.126** actual source
currently falls back through `.plugin` then `.claude-plugin`; full live v1 validation is
**unverified**. These results do not support a blanket compatibility claim or the obsolete
no-schema workaround.

Sources: [adapter generator](https://github.com/SebastienDegodez/skraft-plugin/blob/main/scripts/project-plugin-adapters.mjs),
[CLI compatibility probe](https://github.com/SebastienDegodez/skraft-plugin/blob/main/scripts/copilot-plugin-compat-smoke.mjs)
and [current packaging notes](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/README.md#harness-packaging).
[ADR-008](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/adr/adr-008-single-hook-manifest.md)
preserves measured legacy evidence; it is not current cross-client packaging guidance.

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
| G1 dispatch order | `PreToolUse` hook | Fail closed for a phase agent | None |
| Dispatch provenance | `PreToolUse` hook | Fail open | None |
| G2 mandatory skills | `SubagentStart` hook | Fail open | None |
| G3 skill loads | `PostToolUse` and `SubagentStop` hooks | Fail open | None |
| G4 phase artifacts | State CLI, when a phase closes | Fail closed | Not a hook |
| G5 verdict and DELIVER commit | State CLI, when a phase closes | Fail closed | Not a hook |
| G6 continuation | `PostToolUse` hook | Fail open | None |
| G7 tracked state | `PreToolUse` hook | Fail closed | Last recorded run: Copilot CLI 1.0.83 refused a shell write |
| G8 DELIVER writes | `PreToolUse` hook | Fail open on unreadable state | None |

Every guard is covered by unit and acceptance tests. A live receipt comes only from a real
session (`scripts/copilot-hook-smoke.mjs`, `scripts/claude-plugin-smoke.mjs`); Vally
evaluations do not load plugin hooks.

`SubagentStart` injects the starting agent's mandatory skills only. Rules are not injected:
Copilot discovers path-scoped rules natively, and the orchestrator, the rules' only reader,
loads them itself.

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
call or a read of its `SKILL.md`, never a mention. Both fail open on hook failure so an
internal runtime error cannot freeze the pipeline. They prove a skill was loaded, not that
the agent applied it correctly.

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
