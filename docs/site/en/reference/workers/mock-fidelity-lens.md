---
layout: doc
lang: en
title: "mock-fidelity-lens"
description: "Reviewer lens: audits consumer-side mock wiring — resolved strategy honored, mock URL wired into the test host, no real downstream call, doubles the downstream not the SUT."
persona: software-engineer
---

# mock-fidelity-lens

> Conditional review lens: audits consumer-side mock wiring in integration tests for four fidelity gates — spawned only when the diff touches a downstream mock or an integration test that uses one.

## When active

Spawned by `software-engineer-reviewer` only when the reviewed diff touches:
- A downstream mock setup (Microcks container or in-process test double)
- An integration test that uses a mock

Not one of the CORE review lenses. Joins the adversarial panel conditionally, as a capability lens.

## Inputs

- Code and tests from the reviewed diff
- The resolved mocking strategy (from prompt or `skraft.instructions.md`)

## Output

```json
{
  "lens": "mock-fidelity",
  "verdict": "pass | fail",
  "defects": [{ "id": "D<N>", "gate": "M<N>", "severity": "blocker | high", "location": "file:line", "description": "...", "suggestion": "..." }]
}
```

## Gates

| Gate | Verification | Severity |
|------|-------------|----------|
| M1 | Resolved strategy honored (inprocess → DI double; microcks → Microcks container) | high |
| M2 | Mock actually wired into the test host (URL injected or DI replaced) | blocker |
| M3 | No real downstream call leaks | blocker |
| M4 | Doubles the downstream, not the SUT's own domain | high |

**M1 detail**: if `testing.mocking.strategy: inprocess` was in force, the test must use an in-process double — not a Microcks container, and vice versa.

**M2 detail**: a mock created but not injected into the SUT's client (mock URL not set via `UseSetting`, DI replacement missing) → blocker.

## Invariants

- **Read-only** — never modifies code or tests
- **Every finding names the gate** (M1–M4) and a concrete `file:line` location
- **No journal, no checklist** — A7 independence: reports findings without prior context

## Why this shape

A mock that is created but not wired into the SUT's client silently lets the real service be called, making the test non-deterministic. Each gate closes one failure mode at the transport boundary.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## See also

- [mock-integration-worker]({{ "/en/reference/workers/mock-integration-worker" | relative_url }}) — Worker that produces the mock wiring this lens audits
- [mocking-strategy-roster]({{ "/en/reference/skills/mocking-strategy-roster" | relative_url }}) — Resolves the strategy this lens verifies was honored
- [mocking-microcks-dotnet]({{ "/en/reference/skills/mocking-microcks-dotnet" | relative_url }}) — Default adapter whose output this lens checks
- [mocking-inprocess-dotnet]({{ "/en/reference/skills/mocking-inprocess-dotnet" | relative_url }}) — Override adapter whose output this lens checks
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent whose reviewer panel activates this lens
