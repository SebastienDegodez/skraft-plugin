---
layout: doc
lang: en
title: "contract-testing"
description: "Use when authoring OpenAPI/AsyncAPI contracts, generating Microcks samples, setting up Testcontainers mocks, or verifying provider contracts across DESIGN → DISTILL → DELIVER phases."
persona: tech-lead
---

# contract-testing

> Contract-first API development: the contract is the source of truth across DESIGN → DISTILL → DELIVER.

## When to use

- Authoring an OpenAPI 3.1 or AsyncAPI 2.6.0 contract (DESIGN phase)
- Generating Microcks samples (`.apiexamples.yaml`, `.apimetadata.yaml`) from a contract (DISTILL phase)
- Setting up a `MicrocksContainer` or `MicrocksContainerEnsemble` to mock a downstream dependency (DELIVER phase)
- Verifying a provider implementation with `TestEndpointAsync(TestRequest{ OPEN_API_SCHEMA })`
- Propagating an `info.version` bump atomically across all DESIGN → DISTILL → DELIVER artifacts

## Entry contract

- Bounded context name and resource identifiers (for file naming: kebab-case)
- Stack adapter resolved via [contract-testing-roster]({{ "/en/reference/skills/contract-testing-roster" | relative_url }})
- DISTILL artifacts (`.apiexamples.yaml` + `.apimetadata.yaml`) present before entering DELIVER

## Exit contract

- **DESIGN**: OpenAPI / AsyncAPI YAML at `.copilot-tracking/skraft-plans/{slug}/details/{date}/contracts/{name}.yaml`
- **DISTILL**: `.apiexamples.yaml` + `.apimetadata.yaml` per contract, `metadata.name` matching `info.title - info.version`
- **DELIVER**: `TestEndpointAsync` provider test or `MicrocksContainer` consumer mock wired into the test host

## Invariants

- **Contract is the source of truth** — implementation is verified against it, never the reverse
- **DELIVER wiring is stack-specific** — always resolve via [contract-testing-roster]({{ "/en/reference/skills/contract-testing-roster" | relative_url }})
- **`WithMainArtifacts` import order** — schema first, `.apiexamples.yaml` second, `.apimetadata.yaml` third, in a single call
- **`TestEndpointAsync` not `VerifyAsync`** — `VerifyAsync` checks mock invocation count (consumer-side); `TestEndpointAsync(OPEN_API_SCHEMA)` is provider conformance
- **Never suppress a failing `TestResult`** — `Assert.True(result.Success)` is mandatory; never skip or comment it out

## Why this shape

Coupling tests to a live downstream service makes the suite fragile and non-deterministic. Publishing a contract lets consumer and provider evolve independently while guaranteeing interoperability at the boundary.

> « Consumer-driven contracts let the consumer specify what it needs from a provider. »
> — Newman, S., *Building Microservices, 2nd ed.*, 2021.

## Allowed customisation

- Dispatcher type per operation: `JSON_BODY` | `JS` | `GROOVY` (L1)
- Microcks image version in `MicrocksBuilder.WithImage(...)` (L1)
- Multi-service ensemble via `MicrocksContainerEnsemble` (L2)
- Docker Compose variant for full environment startup with `MicrocksContainerEnsemble` (L2)

## See also

- [contract-testing-roster]({{ "/en/reference/skills/contract-testing-roster" | relative_url }}) — Resolves the per-stack adapter and the Microcks opt-in flag
- [contract-testing-dotnet]({{ "/en/reference/skills/contract-testing-dotnet" | relative_url }}) — .NET adapter: baseline WAF + optional Microcks layer
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that uses this skill
