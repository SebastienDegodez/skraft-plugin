---
layout: doc
lang: en
title: "Walking Skeleton — why and how"
description: "The Walking Skeleton deep dive: the thinnest end-to-end slice that works, and how SKRAFT delivers it first."
---

# Walking Skeleton — why and how

> A *walking skeleton* is the smallest implementation that crosses the whole system
> end-to-end — and actually works. You wire the full path first, then flesh it out.

## The problem (concrete context)

Building layer by layer (the whole database, then all the logic, then the whole API)
pushes integration to the end — at the riskiest moment. You discover late that two
layers do not fit, that deployment breaks, that the network boundary was never thought
through. Each piece "works in isolation" but the whole never works until the very end.

The walking skeleton flips it: the **first** thing delivered is a tiny slice that
touches every layer and runs end-to-end.

## What the sources say

Freeman & Pryce coined the term and made it the starting point of a project tested
from the outside.

> « A Walking Skeleton is the thinnest possible slice of real functionality we can automatically build, deploy, and test end-to-end. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

The idea is rooted in hexagonal architecture: isolating the domain behind ports makes
this first traversal possible without freezing the infrastructure.

> « Allow an application to equally be driven by users, programs, automated tests, or batch scripts. »
> — Cockburn, A., *Hexagonal Architecture*, 2005.

## Application in SKRAFT

In DELIVER, the first slice delivered for a feature is deliberately a walking skeleton.
DISTILL gate **G8** requires it: "at least one walking skeleton scenario per major
flow".

```text
Slice 1 (walking skeleton) — crosses EVERYTHING, does the minimum:
  API  ──►  Application (use case)  ──►  Domain  ──►  Infrastructure
  (1 endpoint)   (1 handler)         (1 invariant)   (1 repo stub)

  ✔ the end-to-end acceptance scenario passes
  ✔ deployment works
  ✔ every boundary is wired

Following slices — thicken each layer on this living skeleton.
```

The pipeline gains an integration proof **from the very first slice**, instead of
deferring it. Everything after adds to a system that already works.

## Pitfalls & anti-patterns

- **Fake skeleton**: a slice that skips a layer (e.g. simulates the API in memory)
  does not prove integration — it is not a walking skeleton.
- **Oversized skeleton**: trying to do everything "properly" in slice 1 cancels the
  benefit; the first slice must be *tiny*.
- **Letting it die**: a skeleton no longer run in CI stops being an integration proof.

## Sources

- Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.
- Cockburn, A. *Hexagonal Architecture*, 2005.

Going further: [Outside-In TDD](outside-in-tdd.html),
[the DELIVER phase]({{ "/en/explanation/pipeline/deliver" | relative_url }}), [DISTILL gates]({{ "/en/reference/gates" | relative_url }}).
