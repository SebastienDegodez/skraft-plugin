---
layout: doc
lang: en
title: "Reference — Skills"
description: "SKRAFT skills: tooled practices, what they do, when to use them."
---

# Reference — Skills

> A *skill* is a tooled practice: a tested procedure an agent loads exactly when it
> needs it. Each skill answers a precise craft problem.

- **[Clean Architecture Testing](clean-architecture-testing.html)** — what to test at
  each layer (Domain, Application, Infrastructure, API), which test double to pick at
  each boundary.
- **[Contract Testing](contract-testing.html)** — contract-first API development:
  OpenAPI/AsyncAPI authoring, Microcks sample generation, provider verification via
  `TestEndpointAsync`. Spans DESIGN → DISTILL → DELIVER.
- **[Contract Testing .NET](contract-testing-dotnet.html)** — .NET adapter for
  provider contract tests: baseline `WebApplicationFactory` + `HttpClient` test always
  emitted; Microcks `TestEndpointAsync` layer added when the opt-in is set.
- **[Contract Testing Roster](contract-testing-roster.html)** — stack + Microcks opt-in
  router for provider contract tests; resolves and points to the matching
  `contract-testing-<stack>` adapter.
- **[Craft Discipline](craft-discipline.html)** — the checkpoints the engineer runs
  against their own work before committing.
- **[Create Custom Agent](create-custom-agent.html)** — how to build an agent file
  (`.agent.md`): tools, instructions, handoffs.
- **[Mocking — In-process .NET](mocking-inprocess-dotnet.html)** — .NET adapter for
  in-process mocking (FakeItEasy / NSubstitute / Moq): double registered into the
  `WebApplicationFactory` DI, `inprocess` override strategy.
- **[Mocking — Microcks .NET](mocking-microcks-dotnet.html)** — .NET adapter for
  Microcks mocking (default strategy): `MicrocksContainerEnsemble` + wiring the
  SUT's HTTP client to the mock URL.
- **[Mocking Strategy Roster](mocking-strategy-roster.html)** — resolves the
  `(strategy × stack)` pair for mocking a downstream dependency; override cascade
  `prompt > skraft.instructions.md > microcks (default)`.
- **[Outside-In TDD](outside-in-tdd.html)** — writing tests from observable behaviour,
  the RED/GREEN double loop, the walking skeleton.
- **[Red-Synthesize-Green](red-synthesize-green.html)** — the disciplined TDD cycle:
  a failing test first, then the minimal implementation that makes it pass.

## See also

- [Architecture patterns]({{ "/en/reference/patterns" | relative_url }})
- [The Outside-In TDD deep dive]({{ "/en/explanation/deep-dive/outside-in-tdd" | relative_url }})
