---
layout: doc
lang: en
title: "mocking-microcks-dotnet"
description: "Use when mocking-strategy-roster resolved (microcks, .NET). Provides the MicrocksContainerEnsemble wiring and WebApplicationFactory scaffold pointing the SUT's typed HttpClient at the mock URL."
persona: tech-lead
---

# mocking-microcks-dotnet

> Default .NET adapter: mocks a downstream dependency from its OpenAPI/examples contract via a MicrocksContainerEnsemble, and wires the SUT's client at the mock endpoint.

## When to use

- When [mocking-strategy-roster]({{ "/en/reference/skills/mocking-strategy-roster" | relative_url }}) resolved `(microcks, .NET)`
- Setting up a `MicrocksContainerEnsemble` seeded from the downstream dependency's contract
- Pointing the SUT's `HttpClient` at the Microcks mock endpoint via `UseSetting`

## Entry contract

- Strategy resolved as `microcks`, stack as `.NET` by [mocking-strategy-roster]({{ "/en/reference/skills/mocking-strategy-roster" | relative_url }})
- Downstream dependency's OpenAPI / examples contract artifact path
- SUT configuration key for the downstream base URL (for `UseSetting`)

## Exit contract

- `{Sut}WebApplicationFactory<TProgram>` with `MicrocksContainerEnsemble` + `WithMainArtifacts(...)` + `GetRestMockEndpoint(name, version)` → `UseSetting`
- Structured result block: `strategy`, `stack`, `files[]`, `testCommand`

## Invariants

- **Mock the downstream dependency, not the SUT** — the container stands in for what the SUT calls
- **`GetRestMockEndpoint(name, version)`** — note: `+` encodes a space in the service name (e.g. `"API+Pastries"`)
- **`VerifyAsync` / `GetServiceInvocationsCountAsync`** — consumer-side only: assert the mock was called; NOT provider contract conformance
- **NuGet**: `Microcks.Testcontainers` + `Testcontainers` (do not reference unrelated `TestContainers` packages)
- **Test command via [resolving-stack-commands]({{ "/en/reference/skills/resolving-stack-commands" | relative_url }})** — never hardcode `dotnet test`

## Why this shape

A Microcks container replays the downstream's published contract examples as a live mock, ensuring the SUT's client serialization and routing match what the contract specifies — without coupling to a real live service.

> « Consumer-driven contracts let the consumer specify what it needs from a provider. »
> — Newman, S., *Building Microservices, 2nd ed.*, 2021.

## Allowed customisation

- Microcks image version in `MicrocksContainerEnsemble` constructor (L1)
- Additional artifacts loaded via `WithMainArtifacts(...)` for multi-downstream scenarios (L2)

## See also

- [mocking-strategy-roster]({{ "/en/reference/skills/mocking-strategy-roster" | relative_url }}) — Resolves `(strategy × stack)` and points to this adapter
- [mocking-inprocess-dotnet]({{ "/en/reference/skills/mocking-inprocess-dotnet" | relative_url }}) — Override (in-process) adapter for the same .NET stack
- [contract-testing]({{ "/en/reference/skills/contract-testing" | relative_url }}) — Authoring the downstream contract that seeds this mock
- [resolving-stack-commands]({{ "/en/reference/skills/resolving-stack-commands" | relative_url }}) — Resolves the test command
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that triggers the worker that loads this skill
