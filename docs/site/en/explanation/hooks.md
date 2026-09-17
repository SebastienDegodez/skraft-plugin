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
Adversarial review (G7) detects violations *after* the fact; hooks detect them *before*.

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
  domain/                ← pure invariants (zero dependencies)
    result.mjs           Ok/Err discriminated union
    value-objects.mjs    Phase, AgentName, ProjectSlug, Verdict
    specifications.mjs   andSpec / orSpec / notSpec
    error-codes.mjs      error code string constants

  ports/                 ← JSDoc contracts (duck-typed)
    api/                 inbound interfaces (PreToolUse, SubagentStop)
    infrastructure/      outbound interfaces (AuditWriter, Filesystem…)

  adapters/
    api/hooks/           ← Api entry point
      payload.mjs        normalise camelCase / PascalCase / snake_case
      decision.mjs       allow / deny / block / additionalContext
      hook-entry.mjs     normalise + route
      hook-router.mjs    switchboard PreToolUse / SubagentStop
      service-factory.mjs composition root
    infrastructure/      ← outbound implementations
      jsonl-audit-writer.mjs   append-only, never truncates
      null-audit-writer.mjs    no-op for tests
      json-state-reader.mjs    reads/writes state.json
      real-filesystem.mjs      node:fs/promises wrapper
      in-memory-filesystem.mjs  test double
      system-time.mjs / fixed-time.mjs

  application/
    config-loader.mjs    cascade: env → ~/.skraft/config.json → .skraftrc.json

  cli/
    hook.mjs             CLI: stdin JSON → router → stdout JSON
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

| Layer | Status |
|-------|--------|
| CA scaffold (`domain/`, `ports/`, `adapters/`, `application/`) | ✅ Delivered (US1) |
| Payload normalisation (camelCase / PascalCase / snake_case) | ✅ Delivered (US1) |
| Decisions (allow / deny / block / additionalContext) | ✅ Delivered (US1) |
| JSONL append-only audit-writer | ✅ Delivered (US1) |
| Config-loader cascade | ✅ Delivered (US1) |
| Business handlers G1–G8 (per-phase invariants) | ✅ Delivered |

`SubagentStart` also bridges packaging differences. Copilot discovers path-scoped rules
natively. Claude receives only companion rules declared by the starting agent, alongside
its mandatory skills; unrelated rules are not added to context.

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

Hooks enforce **structural and behavioural invariants** — dispatch order, artifact
presence, reviewer verdict format, state-file integrity. They are not a general
anti-hallucination system, and two important limits must be stated explicitly.

### G2 and G3 enforce declared methodology, not truth

Guardrail G2 injects mandatory skills at `SubagentStart`; for Claude it also injects
the starting agent's declared companion rules. G3 audits skill reads. Both fail open
on hook failure so an internal runtime error cannot freeze the pipeline. They enforce
declared method, but cannot prove that an agent applied that method correctly.

### Structural violations vs. factual hallucinations

Hooks detect **quality hallucinations**: a missing artifact, an out-of-order
dispatch, a verdict that does not match the written file. They do not detect
**factual hallucinations**: a business rule invented by the model, a non-existent
API endpoint cited in the code, or incorrect domain knowledge embedded in a test.
Factual correctness remains the responsibility of the human reviewer and of
domain-specific acceptance tests.

## Further reading

- [Token economy]({{ "/en/explanation/token-economy" | relative_url }}) — the Genesis levers and the measured reduction ratios

- [Hooks reference]({{ "/en/reference/infrastructure/hooks" | relative_url }}) — 7 events, 4 decisions, SKRAFT_* config
- [Clean Architecture]({{ "/en/explanation/clean-architecture" | relative_url }}) — Api → Infra → Application → Domain layers
