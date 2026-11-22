---
title: "Walking Skeleton — why and how"
description: "The Walking Skeleton deep dive: the thinnest end-to-end slice that works, and how SKRAFT delivers it first."
---

# Walking Skeleton — why and how

A *walking skeleton* is the smallest implementation that crosses the whole system
end-to-end — and actually works. You wire the full path first, then flesh it out.

## The problem (concrete context)

Building layer by layer (the whole database, then all the logic, then the whole API)
pushes integration to the end — at the riskiest moment. You discover late that two
layers do not fit, that deployment breaks, that the network boundary was never thought
through. Each piece "works in isolation" but the whole never works until the very end.

The walking skeleton flips it: the **first** thing delivered is a tiny slice that
touches every layer and runs end-to-end.

## What the sources say

The term comes from Alistair Cockburn ([Cockburn, 2004](../../reference/citations.mdx#cite-cockburn-crystal-2004)).
Freeman & Pryce take it up, credit him, and make it the starting point of a project tested from
the outside: the thinnest slice of real functionality that can be built, deployed and tested
end-to-end automatically ([Freeman & Pryce, 2009](../../reference/citations.mdx#cite-freeman-goos-2009)).

The idea is rooted in hexagonal architecture: isolating the domain behind ports makes
this first traversal possible without freezing the infrastructure.

> « Allow an application to equally be driven by users, programs, automated tests, or batch scripts. »
> — Cockburn, A., *Hexagonal Architecture*, 2005.

## Application in SKRAFT

Every story starts with one, as the outer loop of its double-loop TDD. In DISTILL, the test plan
lists the scenarios in the order DELIVER builds them; S1, tagged `@walking-skeleton`, is the
scenario the walking skeleton walks, in a back-end component. The `boundary-enforcement` lens (G8) judges a plan that tags
another scenario, tags none, or puts S1 in a React front end.

The walking skeleton is a plain test, with no Gherkin, in the component's integration-test place:
it enters through the real entry point (HTTP, CLI, message) wired by the production composition
root, and asserts only the wiring — the status, the shape of the response and one value S1 names
word for word. S1 keeps its own acceptance test beside it, the binding of its Gherkin, like every
other scenario: in the unit-test place, through the use case, every value of the scenario verbatim.

| | Walking skeleton | S1's acceptance test |
| --- | --- | --- |
| Proves | the wiring of the whole chain | the scenario's business rule |
| Form | plain test, no Gherkin | binding of the scenario's `.feature` |
| Enters by | the real entry point | the use case |
| Asserts | status, shape, one value S1 names | every value of the scenario |
| Written | on DISTILL's plan pass, one per story | on its own DISTILL pass, right after |

DISTILL's plan pass commits the walking skeleton failing, with the skeleton of every class of the
chain it crosses — entry point, use case, ports, adapters, wiring — each returning an empty value.
The next pass commits S1's failing acceptance test. A human reads both with the scenarios, then
DELIVER makes S1 pass: its green must turn S1's acceptance test **and** the walking skeleton
green, and every later green keeps the walking skeleton green, without touching its files. The
`boundary-enforcement` lens checks, through gate **G8**, that the walking skeleton runs that real
path and that S1 has its own acceptance test besides.

```text
Walking skeleton (S1's outer loop) — crosses EVERYTHING, asserts the wiring:
  entry point ──►  use case  ──►  ports/adapters  ──►  real database
  (real)          (1 handler)   (wired)              (Testcontainers)

S1's acceptance test — enters by the use case, asserts the business rule.
S2…SN — targeted scenarios that thicken each layer on this living skeleton.
```

The pipeline gains an integration proof **from the very first slice**, instead of
deferring it. Everything after adds to a system that already works.

What each kind of dependency runs on is what sets the walking skeleton apart from every
scenario's acceptance test, S1's included:

| Dependency | Targeted (every acceptance test) | Walking skeleton |
| --- | --- | --- |
| Entry point (controller, CLI, UI, webhook received, topic consumed) | in process | real |
| Internal gateway (repository, database, cache) | in memory | Testcontainers |
| External gateway (REST, SOAP, GraphQL, gRPC, Kafka, webhook sent…) | Microcks | Microcks |
| Clock, randomness | fake | fake |

These are the plugin's defaults; a team overrides them per component in `skraft-config.json`
([infrastructure policy](../../reference/skraft-config.md#infrastructure)). A React front end
carries no walking skeleton of its own: its targeted tests stand in for the back end with MSW,
its Playwright end-to-end tests run against Microcks. A test that needs a container never runs
without one: with neither Docker nor Podman answering, the agent stops, blocked, asking a human to start one
and the run waits.

Not every story opens a new path. One that adds no entry point declares why under the table:
`library` (a pure library), `refactoring` (no new public interface) or `docs-only`
(configuration or documents only). An exemption removes the walking skeleton only, never S1's
acceptance test. The `boundary-enforcement` lens checks the exemption against the story's changes: a `docs-only` story whose
commits change a component's source does not hold.

## Pitfalls & anti-patterns

- **Fake skeleton**: a slice that skips a layer (e.g. simulates the API or the database in
  memory) does not prove integration — it is not a walking skeleton.
- **Oversized skeleton**: trying to do everything "properly" in slice 1 cancels the
  benefit; the first slice must be *tiny*.
- **Letting it die**: a skeleton no longer run in CI stops being an integration proof.
- **Skeleton standing in for S1**: a walking skeleton carrying the scenario's business assertions
  doubles S1's acceptance test on the slow path, and one replacing it leaves S1's Gherkin run
  nowhere.
- **An exemption of convenience**: declaring `library` or `refactoring` to skip the skeleton. The
  lens judges the exemption from the story's changes; the human who reads the scenarios is there too.

## Sources

- [Cockburn, A. *Crystal Clear: A Human-Powered Methodology for Small Teams*, 2004.](../../reference/citations.mdx#cite-cockburn-crystal-2004)
- [Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.](../../reference/citations.mdx#cite-freeman-goos-2009)
- Cockburn, A. *Hexagonal Architecture*, 2005.

## See also <!-- #see-also -->

- [Outside-In TDD](outside-in-tdd.md)
- [The DELIVER phase](../pipeline/deliver.mdx)
- [DISTILL gates](../../reference/gates.md)
