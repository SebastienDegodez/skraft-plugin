---
layout: doc
lang: en
title: "mocking-strategy-roster"
description: "Use when an agent must mock a downstream HTTP/event dependency and needs to know which mocking strategy and stack adapter to use. Resolves (strategy × stack) — no agent hardcodes a mocking approach."
persona: tech-lead
---

# mocking-strategy-roster

> Two orthogonal axes — strategy (microcks | inprocess) × stack: the single place that resolves how a downstream dependency is mocked for an integration test.

## When to use

- Before emitting downstream mock wiring — loaded by [mock-integration-worker]({{ "/en/reference/workers/mock-integration-worker" | relative_url }})
- Determining whether to use a Microcks container (default) or an in-process test double (override)
- Adding a new stack adapter (add one row + one `mocking-{strategy}-{stack}` skill, zero other edits)

## Entry contract

- Run prompt (may carry a strategy/library override — highest priority)
- `.github/instructions/skraft.instructions.md` fields `testing.mocking.strategy` and `testing.mocking.library` (read by tool call, never recalled)

## Exit contract

- Resolved adapter link (e.g. [mocking-microcks-dotnet]({{ "/en/reference/skills/mocking-microcks-dotnet" | relative_url }}) or [mocking-inprocess-dotnet]({{ "/en/reference/skills/mocking-inprocess-dotnet" | relative_url }}))
- OR: `status: blocked` payload with `type` and `context` if the strategy/library/stack is unsupported

## Invariants

- **Read overrides by tool call** — never assume from recall; if the file is absent, fall through to default `microcks`
- **Cascade**: explicit prompt > `skraft.instructions.md` `testing.mocking.*` > default `microcks`
- **Unknown strategy → stop** — emit `status: blocked` with `type: unsupported_mocking_strategy`; never invent a wiring
- **Unknown library when `strategy: inprocess` → stop** — emit `status: blocked` with `type: unsupported_mocking_library`
- **Adding a strategy or stack = one adapter + one table row** — zero edits to this skill or the worker

## Why this shape

Centralising the routing decision prevents each worker from encoding a mocking approach. The two axes (strategy and stack) are independent: a new stack plugs in without touching the strategy logic, and vice versa.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## Adapter table

| Strategy | Stack | Adapter | Status |
|----------|-------|---------|--------|
| microcks | .NET | [mocking-microcks-dotnet]({{ "/en/reference/skills/mocking-microcks-dotnet" | relative_url }}) | supported |
| inprocess | .NET | [mocking-inprocess-dotnet]({{ "/en/reference/skills/mocking-inprocess-dotnet" | relative_url }}) | supported |
| microcks | Java | *(mocking-microcks-java not yet provided)* | NOT SUPPORTED |
| inprocess | Java | *(mocking-inprocess-java not yet provided)* | NOT SUPPORTED |

## Allowed customisation

- Per-strategy/stack adapters added independently (no edits to this skill or the worker)

## See also

- [mocking-microcks-dotnet]({{ "/en/reference/skills/mocking-microcks-dotnet" | relative_url }}) — Default (Microcks) adapter for .NET
- [mocking-inprocess-dotnet]({{ "/en/reference/skills/mocking-inprocess-dotnet" | relative_url }}) — Override (in-process) adapter for .NET
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that triggers the worker that loads this skill
