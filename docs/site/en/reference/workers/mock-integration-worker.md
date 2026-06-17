---
layout: doc
lang: en
title: "mock-integration-worker"
description: "[Internal worker — dispatched by software-engineer only] Resolves a mocking strategy (Microcks default, overridable to in-process) × stack and emits the downstream mock wiring plus an integration-test scaffold."
persona: software-engineer
---

# mock-integration-worker

> Internal worker dispatched by `software-engineer` during DELIVER: resolves `(strategy × stack)` and emits the downstream mock wiring + integration-test scaffold — consumer-side only.

## When active

Dispatched by `software-engineer` during the DELIVER phase when an integration test needs to mock a downstream HTTP or event dependency the SUT calls. Not user-invocable directly.

**This worker is consumer-side**: it replaces what the SUT calls. It does NOT produce a provider contract test — that is [contract-testing-worker]({{ "/en/reference/workers/contract-testing-worker" | relative_url }}).

## Inputs

**Required:**
- Downstream dependency descriptor (the client interface the SUT calls)
- Integration-test intent for the active slice

**Context:**
- `.copilot-tracking/skraft-plans/{slug}/state.json` (`depthTier` + `difficulty`)
- Run prompt (may carry a strategy/library override)
- `.github/instructions/skraft.instructions.md` — `testing.mocking.*` namespace

## Output

Structured result block returned to the lead — no commit:

```yaml
status: ok
capability: mocking
strategy: microcks | inprocess
stack: dotnet
library: fakeiteasy | nsubstitute | moq   # only when strategy == inprocess
files:
  - <relative paths created>
testCommand: <resolved test command>
notes: <one line — what was mocked and how it is wired>
```

## Workflow

1. Load [mocking-strategy-roster]({{ "/en/reference/skills/mocking-strategy-roster" | relative_url }}) — resolve `(strategy × stack)` via cascade (prompt > `skraft.instructions.md` `testing.mocking.*` > default `microcks`)
2. On blocker (unknown strategy/library/unsupported stack): return the roster's `blocked` payload verbatim
3. Load the resolved `mocking-{strategy}-{stack}` adapter and emit the mock wiring + test scaffold
4. Resolve the test command via [resolving-stack-commands]({{ "/en/reference/skills/resolving-stack-commands" | relative_url }})
5. Return the structured result to the lead

## Invariants

- **Mock the downstream dependency, never the SUT itself** — doubles the downstream at the HTTP boundary
- **Read overrides by tool call** — never from recall (S6 RULE BRIDGE)
- **Resolve the test command** via `resolving-stack-commands` — never hardcode (S7 DETERMINISTIC TOOL BRIDGE)
- **No commit** — returns a structured result; the lead commits
- **No provider contract verification** — `VerifyAsync` is a different capability (contract-testing)

## Why this shape

Separating the worker (mock wiring) from the lead (business TDD) keeps each responsibility at its natural scope. The lead verifies the mock is called correctly in the TDD loop without delegating the routing decision to the worker.

> « Start with a failing test that describes the behaviour you want, guided by tests from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

## See also

- [mocking-strategy-roster]({{ "/en/reference/skills/mocking-strategy-roster" | relative_url }}) — Resolves `(strategy × stack)`
- [mocking-microcks-dotnet]({{ "/en/reference/skills/mocking-microcks-dotnet" | relative_url }}) — Default adapter applied by this worker for .NET
- [mocking-inprocess-dotnet]({{ "/en/reference/skills/mocking-inprocess-dotnet" | relative_url }}) — Override adapter applied by this worker for .NET
- [mock-fidelity-lens]({{ "/en/reference/workers/mock-fidelity-lens" | relative_url }}) — Conditional lens that audits the output of this worker
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that dispatches this worker
