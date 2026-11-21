---
title: "Outside-In TDD — why and how"
description: "The Outside-In TDD deep dive: double loop, boundary-to-boundary, a concrete example of the RED/GREEN cycle in SKRAFT."
---

# Outside-In TDD — why and how

We grow software from the outside in: an acceptance test guides the unit tests,
which guide the implementation. The design *emerges* — it is not guessed up front.

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

The pipeline applies the **double loop**, one dispatch for the whole story. The outer loop is the
acceptance scenarios: DISTILL commits the failing test of every one in one commit, after one run
whose output shows each failing on an assertion, which the DISTILL review reads. The inner loop is the unit RED → GREEN → REFACTOR cycle, which
the `software-engineer` runs in DELIVER without committing it.

The story itself opens on a wider outer loop, its [walking skeleton](walking-skeleton.md): a
plain test that enters through the real entry point and checks only the wiring. DISTILL commits
it failing with the acceptance tests; the green of the group holding S1 makes both pass, and every
later green keeps the walking skeleton green. Each scenario's acceptance test, S1's included, enters through the use case.

```text
┌─ Outer loop (acceptance, every group in plan order) ─────────┐
│  RED  : DISTILL commits every scenario's test, failing, once  │
│         → test(<story>): acceptance tests S1–Sn               │
│   ┌─ Inner loop (unit, not committed) ────────────────────┐  │
│   │  RED → a unit test fails                                │  │
│   │  GREEN → minimal implementation that makes it pass      │  │
│   │  REFACTOR → clean up without changing behaviour         │  │
│   └─────────────────────────────────────────────────────────┘ │
│  GREEN : the group's acceptance scenarios pass                │
│         → feat(<story>): <rule>   (later groups still fail)   │
└──────────────────────────────────────────────────────────────┘
then the next group, in the same dispatch
```

Concretely, the `software-engineer` creates an interface only when a unit test needs it to
isolate a boundary — never "just in case". The acceptance test stays red until the scenario is
complete, which keeps the focus on business behaviour, and it never changes: written by another
agent, it is the oracle the code must meet. Each scenario ends in one green commit, chained to
the test command so that it happens only once the tests pass.

Only one acceptance test is red at a time, beside the walking skeleton until S1 is green. DISTILL writes the next scenario's test once the one
before passes, so a red in the history always names the scenario in progress. The inner loop's
unit tests are never seen failing by the engine; mutation, run last on the whole story, is what
shows they would catch a mistake.

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

## See also <!-- #see-also -->

- [Walking Skeleton](walking-skeleton.md)
- [The DELIVER phase](../pipeline/deliver.mdx)
- [The glossary](../../reference/glossary.md)
