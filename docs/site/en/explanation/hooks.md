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

SKRAFT introduces a hooks harness plugged into Copilot runtime events. Each hook
intercepts an event (`PreToolUse`, `SubagentStop`, …), evaluates the normalised
payload, and returns a decision (`allow`, `deny`, `block`, `additionalContext`).

```
Copilot runtime
      │
      ▼  PreToolUse (tool: bash, tool_input: …)
 hook.mjs ──► normalise(payload) ──► router ──► handler
                                                    │
                                          ┌─────────┤
                                        allow     deny / block
                                          │             │
                                      execution     blocked
```

The agent receives `deny` or `block` before the tool executes — the invariant cannot
be silently violated.

## Framework structure

The framework lives under `plugins/src/` at the repo root:

```
plugins/src/
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

The Copilot runtime calls `node plugins/src/cli/hook.mjs <HookType>` for each event
declared in `.github/hooks/skraft.json`.

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
| Business handlers G1–G8 (per-phase invariants) | 🚧 Coming (US2+) |

Business handlers (which actually inspect payloads to enforce SKRAFT invariants) are
planned in subsequent user stories.

## Genesis & token economy

The Genesis discipline applies directly to the hook harness on two axes.

### 1. `coverageAnalysis: perTest` — mutation testing 5× cheaper

`stryker.config.mjs` uses `coverageAnalysis: 'perTest'`. Stryker instruments each
test to know which mutants it covers, then only runs the relevant tests per mutant.

On this project (183 mutants, 6 test files):

| Metric | Without `perTest` | With `perTest` |
|--------|-------------------|----------------|
| Tests run per mutant | 6 (all) | 1.14 (measured average) |
| Total executions | 183 × 6 = **1,098** | 183 × 1.14 ≈ **209** |
| **Savings ratio** | — | **5.25× fewer executions** |

*Number measured on this project's Stryker dry-run — not estimated.*

### 2. Deterministic enforcement = zero reasoning tokens

Without a hook, the agent must *reason* about each invariant at every tool call:

- "Should I normalise this payload?"
- "Is this audit-writer really append-only?"
- → ~50–200 reasoning tokens per tool, accumulated across the session

With a `PreToolUse` hook, enforcement is **native code** (zero tokens, exit 0 or
JSON response). The agent receives `deny`/`allow` without producing a reasoning
chain about the invariant.

The gain is not quantifiable without a comparison baseline — but the principle is
the Genesis **"tool surface"** lever: reducing the decision surface per turn shortens
the response and reduces the necessary context window.

### 3. `depthTier` and reviewer fan-out

The `depthTier` (`basic` / `standard` / `comprehensive`) governs how many adversarial
lenses are spawned (1 / 2 / 4). On a DELIVER phase in `basic` mode, the reviewer's
`SubagentStop` hook intercepts only one verdict instead of four.
Less fan-out = less context reloaded = fewer tokens.

> **Genesis rule**: a `basic` run must not cost like a `comprehensive` run.
> Hooks enforce this mechanically — a reviewer attempting 4 lenses in `basic` mode
> receives `deny` before execution.

## Further reading

- [Hooks reference]({{ "/en/reference/infrastructure/hooks" | relative_url }}) — 7 events, 4 decisions, SKRAFT_* config
- [Clean Architecture]({{ "/en/explanation/clean-architecture" | relative_url }}) — Api → Infra → Application → Domain layers
