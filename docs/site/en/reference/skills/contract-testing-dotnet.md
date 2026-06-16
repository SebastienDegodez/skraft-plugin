---
layout: doc
lang: en
title: "contract-testing-dotnet"
description: "Use when contract-testing-roster resolved a .NET stack. Always emits a WebApplicationFactory baseline; adds Microcks TestEndpointAsync when the opt-in is set."
persona: tech-lead
---

# contract-testing-dotnet

> Concrete .NET adapter for a provider-side contract test: Layer 1 (WebApplicationFactory) is always emitted; Layer 2 (Microcks TestEndpointAsync) is additive when the opt-in is set.

## When to use

- When [contract-testing-roster]({{ "/en/reference/skills/contract-testing-roster" | relative_url }}) resolved `.NET` as the stack
- Emitting the baseline integration test (Layer 1 — always required)
- Stacking the Microcks contract-verification layer (Layer 2 — only when `microcks: true`)

## Entry contract

- Stack resolved as .NET by [contract-testing-roster]({{ "/en/reference/skills/contract-testing-roster" | relative_url }})
- Microcks opt-in flag: `false` (default) | `true`
- Contract artifacts (`{api}.yaml` + `.apiexamples.yaml` + `.apimetadata.yaml`) when opt-in is `true`

## Exit contract

- **Layer 1** (always): `WebApplicationFactory<Program>` + typed `HttpClient` integration test asserting status code, content type, and `ProblemDetails` shape on error paths
- **Layer 2** (opt-in only): `MicrocksContainer` + `TestEndpointAsync(TestRequest{ OPEN_API_SCHEMA })` against `host.testcontainers.internal:{port}`
- Structured result block: `stack`, `microcks`, `files[]`, `testCommand`

## Invariants

- **Layer 1 is ALWAYS emitted** — regardless of the opt-in flag
- **Layer 2 is ADDITIVE** — never replaces Layer 1, never emitted without it
- **Layer 2 needs a real Kestrel port** — `WebApplicationFactory` exposes no TCP port; boot the SUT via a shared host factory and read the port from `IServerAddressesFeature`
- **`TestEndpointAsync` not `VerifyAsync`** — `VerifyAsync` returns a `bool` asserting a mock was hit (consumer-side); never use it for provider conformance
- **Never suppress a failing `TestResult`** — `Assert.True(testResult.Success, ...)` must not be removed or skipped
- **Real API** — `MicrocksBuilder...Build()` + `await StartAsync()`; `WithMainArtifacts(params string[])`; no `BuildAsync()`, no singular `WithMainArtifact`
- **Test command via [resolving-stack-commands]({{ "/en/reference/skills/resolving-stack-commands" | relative_url }})** — never hardcode `dotnet test`

## Why this shape

An in-memory test server validates the application wiring without coupling to a live dependency. Stacking a Microcks contract layer on top replays the published contract examples against the running service, making conformance a deterministic gate.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## Allowed customisation

- Microcks image in `MicrocksBuilder.WithImage(...)` (L1)
- Exposed port via `TestcontainersSettings.ExposeHostPortsAsync(...)` (L1)
- Shared fixture via `MicrocksFixture` + `ICollectionFixture` (L2)

## See also

- [contract-testing]({{ "/en/reference/skills/contract-testing" | relative_url }}) — Generic contract authoring (OpenAPI, Microcks samples, artifact bridging)
- [contract-testing-roster]({{ "/en/reference/skills/contract-testing-roster" | relative_url }}) — Resolves this adapter and the opt-in flag
- [resolving-stack-commands]({{ "/en/reference/skills/resolving-stack-commands" | relative_url }}) — Resolves the test command
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that triggers this adapter
