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

### Backlog — DISCOVER & DISCUSS

- **[github-search-protocol](github-search-protocol.html)** — build GitHub Search queries, paginate results, filter by labels/milestones/assignees.
- **[issue-triage](issue-triage.html)** — assign labels, priority, effort estimates, detect duplicates, build a sprint proposal.
- **[issue-refinement](issue-refinement.html)** — transform a raw issue into an INVEST user story with acceptance criteria, splitting patterns, DoR 8-items.
- **[sprint-planning](sprint-planning.html)** — plan sprint content, prioritise stories, estimate capacity, analyse dependencies.

### Architecture — DESIGN

- **[architecture-decisions](architecture-decisions.html)** — document architecture decisions as ADRs, evaluate trade-offs, manage lifecycle.
- **[architecture-patterns](architecture-patterns.html)** — Event Modeling, strategic & tactical DDD, Clean Architecture, CQRS, Event Sourcing.

### Review criteria (Reviewers)

- **[acceptance-review-criteria](acceptance-review-criteria.html)** — gates G1-G6 for DISTILL artefacts (Gherkin scenarios, test plans, implementation plans).
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — produce an adversarial verdict via 4 independent lenses and weighted synthesis (Genesis A7 pattern).
- **[architecture-review-criteria](architecture-review-criteria.html)** — gates for DESIGN artefacts (event models, ADRs, diagrams, interface contracts).
- **[discovery-review-criteria](discovery-review-criteria.html)** — gates G1-G6 for DISCOVER artefacts (triage reports, sprint proposals).
- **[planning-review-criteria](planning-review-criteria.html)** — gates G1-G8 for DISCUSS artefacts (stories, acceptance criteria, sprint plans).

### Tests & quality — DELIVER

- **[bdd-methodology](bdd-methodology.html)** — write and structure BDD scenarios in Gherkin: Given/When/Then, Scenario Outline, Background, tag strategy.
- **[mutation-testing](mutation-testing.html)** — kill surviving mutants, verify test quality via mutation score, analyse Stryker reports.
- **[playwright-evidence](playwright-evidence.html)** — capture E2E evidence (screenshots, videos, traces) and store them in the SKRAFT tracking store.
- **[quality-gates-dotnet](quality-gates-dotnet.html)** — `dotnet` / `stryker` commands and their mapping onto the evidence contract schema (.NET).
- **[quality-gates-evidence-contract](quality-gates-evidence-contract.html)** — tech-agnostic structured evidence log schema attesting quality gates.
- **[test-design-mandates](test-design-mandates.html)** — coverage matrices, Clean Architecture layer assignment, outside-in implementation order, Walking Skeleton.
- **[test-refactoring-catalog](test-refactoring-catalog.html)** — refactor tests after GREEN: extract helpers, rename for business clarity, consolidate parametrised cases.

### Stack resolution & routing

- **[resolving-stack-commands](resolving-stack-commands.html)** — resolve the concrete command (build, test, mutation) from the detected stack; no agent hardcodes `dotnet test`.
- **[skraft-difficulty-routing](skraft-difficulty-routing.html)** — evaluate the 3-axis routing (entry point, depth tier, difficulty tier) at DISCOVER exit.

## See also

- [Architecture patterns]({{ "/en/reference/patterns" | relative_url }})
- [The Outside-In TDD deep dive]({{ "/en/explanation/deep-dive/outside-in-tdd" | relative_url }})
