---
layout: doc
lang: en
title: "clean-architecture-testing"
persona: tech-lead
---

# clean-architecture-testing

> Defines what to test at each Clean Architecture layer, with which type of test double and at which granularity.

## When to use

- When deciding what to test and at which level (Domain, Application, Infrastructure, API, Architecture)
- In preparation for the DELIVER phase
- To resolve a "is this test unit or integration?" conflict

## Entry contract

- Defined architecture (bounded contexts, layers, ports/adapters)
- Existing BDD scenarios (`.feature` files)

## Exit contract

- Coverage matrix: layer × test type
- Test double strategy per boundary (stub, mock, spy, fake)

## Invariants

- **No duplicate testing** — Each behaviour is tested at a single layer
- **Domain = pure unit tests** — No external dependencies in domain tests
- **Infrastructure = integration tests** — Adapters are tested with real systems
- See [Customisation](/en/customisation) for the full list

## Why this shape

Architecture must support the system's use cases — and tests must reflect that structure. Testing at the wrong level creates fragile suites that break without business reason.

> « Good architecture makes the system easy to understand, easy to develop, easy to maintain, and easy to deploy. »
> — Martin, R. C., *Clean Architecture*, 2017.

Test doubles (stubs, mocks, fakes) are chosen based on the architectural boundary they replace, not for technical convenience.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## Allowed customisation

- Allowed test double types per layer (L2)
- Coverage threshold per layer (L2)
- Test naming conventions (L1)

## See also

- [outside-in-tdd](/en/reference/skills/outside-in-tdd) — Outside-In TDD skill
- [software-engineer](/en/reference/agents/software-engineer) — Agent that uses this skill
- [Architecture](/en/architecture) — CQS view of the pipeline
