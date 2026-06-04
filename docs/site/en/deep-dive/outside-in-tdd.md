---
layout: doc
lang: en
title: "Outside-In TDD — why and how"
description: "The Outside-In TDD deep dive: double loop, boundary-to-boundary, a concrete example of the RED/GREEN cycle in SKRAFT."
---

# Outside-In TDD — why and how

> We grow software from the outside in: an acceptance test guides the unit tests,
> which guide the implementation. The design *emerges* — it is not guessed up front.

## The problem (concrete context)

The "inside-out" approach (write the entities first, then wire them up) often produces
code nobody needed: over-general classes, speculative methods, an infrastructure layer
designed before knowing what the business expects. The result: dead code, fragile tests
coupled to the implementation, and a design frozen too early.

Outside-In reverses the direction: you start from the **observable behaviour** (what
the user or calling system expects) and only create an internal collaboration when a
test demands it.

## What the sources say

The test-first discipline comes from Beck: write a failing test *before* a single line
of implementation.

> « Never write a line of functional code without a broken test case. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

Freeman & Pryce formalise the "outside-in" variant with its double loop: an outer loop
(acceptance) framing an inner loop (unit).

> « We grow working software, guided by tests, from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

## Application in SKRAFT

The DELIVER phase applies the **double loop**. The outer loop is the acceptance
scenario coming from DISTILL; the inner loop is the unit RED → GREEN → REFACTOR cycle.

```text
┌─ Outer loop (acceptance, from DISTILL) ──────────────────────┐
│  RED  : the .feature scenario fails (nothing is wired)        │
│   ┌─ Inner loop (unit) ───────────────────────────────────┐  │
│   │  RED → a unit test fails                                │  │
│   │  GREEN → minimal implementation that makes it pass      │  │
│   │  REFACTOR → clean up without changing behaviour         │  │
│   └─────────────────────────────────────────────────────────┘ │
│  GREEN : the acceptance scenario passes in turn              │
└──────────────────────────────────────────────────────────────┘
```

Concretely, the `software-engineer` creates an interface (port) only when a unit test
needs it to isolate a boundary — never "just in case". The acceptance test stays red
until the slice is complete, which keeps the focus on business behaviour.

## Pitfalls & anti-patterns

- **Testing the implementation**: asserting on internal calls instead of observable
  behaviour makes the test fragile to refactoring.
- **Skipping RED**: writing the test after the code strips it of its falsifying power
  — you no longer know whether it would actually fail.
- **Over-mocking**: a mock at every internal boundary turns the test into a mirror of
  the code (see the *test-integrity* lens).

## Sources

- Beck, K. *Test-Driven Development by Example*, 2003.
- Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.

Going further: [Walking Skeleton](walking-skeleton.html),
[the DELIVER phase](../pipeline/deliver.html), [the glossary](../glossary.html).
