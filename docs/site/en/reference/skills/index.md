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
- **[Craft Discipline](craft-discipline.html)** — the checkpoints the engineer runs
  against their own work before committing.
- **[Create Custom Agent](create-custom-agent.html)** — how to build an agent file
  (`.agent.md`): tools, instructions, handoffs.
- **[Outside-In TDD](outside-in-tdd.html)** — writing tests from observable behaviour,
  the RED/GREEN double loop, the walking skeleton.
- **[Red-Synthesize-Green](red-synthesize-green.html)** — the disciplined TDD cycle:
  a failing test first, then the minimal implementation that makes it pass.

### Mocking & contract testing

These skills wire the tests in the DELIVER phase. No agent hardcodes a library: it
resolves the strategy through a *roster*, which points to the per-stack adapter.
Adding a stack = +1 adapter, zero edits to the agents.

- **mocking-strategy-roster** — resolves the mocking strategy (Microcks by default,
  overridable to an in-process library via `skraft.instructions.md`) and the stack.
- **mocking-microcks-dotnet** — Microcks Testcontainers + `WebApplicationFactory`
  wiring that points the system-under-test's typed HTTP client at the mock URL (.NET).
- **mocking-inprocess-dotnet** — in-process double (priority FakeItEasy >
  NSubstitute > Moq) injected into the DI in place of the Microcks container (.NET).
- **contract-testing** — canonical cross-phase skill for contract-first API
  development: author OpenAPI/AsyncAPI contracts in DESIGN, generate Microcks
  samples in DISTILL, verify the provider contract in DELIVER via Testcontainers.
  The stack-specific wiring is resolved through the roster.
- **contract-testing-roster** — resolves the stack and the Microcks opt-in for a
  provider-side contract test; a baseline in-process integration test is always produced.
- **contract-testing-dotnet** — baseline `WebApplicationFactory` + `HttpClient`
  always produced; Microcks verification layer added as an opt-in (.NET).

## See also

- [Architecture patterns]({{ "/en/reference/patterns" | relative_url }})
- [The Outside-In TDD deep dive]({{ "/en/explanation/deep-dive/outside-in-tdd" | relative_url }})
