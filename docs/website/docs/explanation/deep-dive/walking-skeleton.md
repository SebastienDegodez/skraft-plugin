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

Every story starts with one. In DISTILL, the test plan lists the scenarios in the order DELIVER
builds them; S1, tagged `@walking-skeleton`, is the walking skeleton, in a back-end component:
entry point → use case → real database. The engine refuses a plan that tags another scenario,
tags none, or puts S1 in a React front end. DISTILL commits S1's failing acceptance test first, a
human reads it with the other scenarios, and DELIVER makes it pass before any other scenario gets
its test. The `boundary-enforcement` lens still checks, through gate **G8**, that each flow has
its walking-skeleton scenario.

```text
S1 (walking skeleton) — crosses EVERYTHING, does the minimum:
  entry point ──►  use case  ──►  Domain  ──►  real database
  (real)          (1 handler)   (1 invariant)  (Testcontainers)

  ✔ the end-to-end acceptance scenario passes
  ✔ every boundary is wired

S2…SN — targeted scenarios that thicken each layer on this living skeleton.
```

The pipeline gains an integration proof **from the very first slice**, instead of
deferring it. Everything after adds to a system that already works.

What each kind of dependency runs on is what sets S1 apart from the targeted scenarios that
follow:

| Dependency | Targeted scenarios | Walking skeleton |
| --- | --- | --- |
| Entry point (controller, CLI, UI, webhook received, topic consumed) | in process | real |
| Internal gateway (repository, database, cache) | in memory | Testcontainers |
| External gateway (REST, SOAP, GraphQL, gRPC, Kafka, webhook sent…) | Microcks | Microcks |
| Clock, randomness | fake | fake |

These are the plugin's defaults; a team overrides them per component in `skraft-config.json`
([infrastructure policy](../../reference/skraft-config.md#infrastructure)). A React front end
carries no walking skeleton of its own: its targeted tests stand in for the back end with MSW,
its Playwright end-to-end tests run against Microcks. A test that needs a container never runs
without one: with neither Docker nor Podman answering, the replay judge asks a human to start one
and the run waits.

Not every story opens a new path. One that adds no entry point declares why under the table:
`library` (a pure library), `refactoring` (no new public interface) or `docs-only`
(configuration or documents only). The engine checks the last one against the diff: a `docs-only`
story whose commits change a component's source is refused.

## Pitfalls & anti-patterns

- **Fake skeleton**: a slice that skips a layer (e.g. simulates the API or the database in
  memory) does not prove integration — it is not a walking skeleton.
- **Oversized skeleton**: trying to do everything "properly" in slice 1 cancels the
  benefit; the first slice must be *tiny*.
- **Letting it die**: a skeleton no longer run in CI stops being an integration proof.
- **An exemption of convenience**: declaring `library` or `refactoring` to skip the skeleton. The
  engine checks only `docs-only` against the diff; the human who reads the scenarios is there for
  the others.

## Sources

- [Cockburn, A. *Crystal Clear: A Human-Powered Methodology for Small Teams*, 2004.](../../reference/citations.mdx#cite-cockburn-crystal-2004)
- [Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.](../../reference/citations.mdx#cite-freeman-goos-2009)
- Cockburn, A. *Hexagonal Architecture*, 2005.

## See also <!-- #see-also -->

- [Outside-In TDD](outside-in-tdd.md)
- [The DELIVER phase](../pipeline/deliver.mdx)
- [DISTILL gates](../../reference/gates.md)
