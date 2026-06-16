---
layout: doc
lang: en
title: "mocking-inprocess-dotnet"
description: "Use when mocking-strategy-roster resolved (inprocess, .NET). Provides the concrete in-process test double registered in the WebApplicationFactory DI instead of a Microcks container."
persona: tech-lead
---

# mocking-inprocess-dotnet

> In-process .NET adapter (override): replaces a downstream dependency with a test double registered in the WebApplicationFactory DI — selected when the operator overrides the Microcks default.

## When to use

- When [mocking-strategy-roster]({{ "/en/reference/skills/mocking-strategy-roster" | relative_url }}) resolved `(inprocess, .NET)`
- Replacing a downstream HTTP client with an in-process test double (FakeItEasy, NSubstitute, or Moq)
- When a Microcks container is unavailable or explicitly overridden by the operator

## Entry contract

- Strategy resolved as `inprocess`, stack as `.NET` by [mocking-strategy-roster]({{ "/en/reference/skills/mocking-strategy-roster" | relative_url }})
- Library resolved (prompt > `skraft.instructions.md` `testing.mocking.library` > priority table)
- Downstream client interface `I{Downstream}Client` identified

## Exit contract

- `{Sut}ApiFactory : WebApplicationFactory<Program>` with `RemoveAll<I{Downstream}Client>()` + `AddSingleton(DownstreamDouble)`
- `DownstreamDouble` property exposing the double for per-test arrangement
- Structured result block: `strategy`, `stack`, `library`, `files[]`, `testCommand`

## Invariants

- **Double the downstream client interface, not the SUT's own domain** — this is an integration-test double at the HTTP boundary
- **Library priority (first found in test project wins)**: FakeItEasy > NSubstitute > Moq
- **`RemoveAll` before `AddSingleton`** — avoids duplicate registrations
- **Test command via [resolving-stack-commands]({{ "/en/reference/skills/resolving-stack-commands" | relative_url }})** — never hardcode `dotnet test`

## Library table (priority order — top = highest)

| Priority | Library | NuGet | Double creation |
|----------|---------|-------|-----------------|
| 1 | FakeItEasy | `FakeItEasy` | `A.Fake<I{Downstream}Client>()` |
| 2 | NSubstitute | `NSubstitute` | `Substitute.For<I{Downstream}Client>()` |
| 3 | Moq | `Moq` | `new Mock<I{Downstream}Client>()` (use `.Object`) |

## Why this shape

Swapping a dependency in the DI container at the transport boundary keeps tests fast and deterministic without container overhead, while still exercising the real application composition.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## Allowed customisation

- Choice of library (L1, follows priority table if not named)
- Additional DI replacements for secondary downstream clients (L2)

## See also

- [mocking-strategy-roster]({{ "/en/reference/skills/mocking-strategy-roster" | relative_url }}) — Resolves `(strategy × stack)` and points to this adapter
- [mocking-microcks-dotnet]({{ "/en/reference/skills/mocking-microcks-dotnet" | relative_url }}) — Default (Microcks) adapter for the same .NET stack
- [resolving-stack-commands]({{ "/en/reference/skills/resolving-stack-commands" | relative_url }}) — Resolves the test command
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that triggers the worker that loads this skill
