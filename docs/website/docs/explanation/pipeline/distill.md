---
title: "DISTILL"
description: "Why DISTILL writes the executable contract before the code: business-language scenarios, a test failing for the right reason, a skeleton with no behaviour."
persona: software-engineer
phase: distill
---

# DISTILL

Write the contract before the code: DISTILL turns DESIGN's decisions into scenarios the
business can read and an acceptance test that fails.

## Why this phase exists

An acceptance criterion in prose gets interpreted; an executable scenario does not. DISTILL turns
the expected behaviour into a **contract** between the business and the code: *Given / When /
Then* scenarios written in the story's vocabulary, and a test plan that places each behaviour at
the right level of the architecture. This is specification by example
([Adzic, 2011](../../reference/citations.mdx#cite-adzic-specification-2011)) carried all the way to the test.

The `acceptance-designer` that writes this contract does not write the implementation. By
separating the two, SKRAFT keeps one agent from fitting the test to its own code.

:::info[☕ Running example — Starbucks *(illustrative)*]

The ADR and the event model enter. DISTILL writes the **Gherkin scenario**: "Given a cart with a
latte / When payment is approved / Then a receipt is issued and loyalty points are credited."
This scenario becomes the contract DELIVER must turn green.
:::

## A red that proves something

DISTILL does not stop at scenarios: it writes the first acceptance test and commits it
**failing**. The engine replays that commit and checks the test really fails. This is the outer
loop of outside-in TDD: start with a test that describes what the system must do, seen from the
outside ([Freeman & Pryce, 2009](../../reference/citations.mdx#cite-freeman-goos-2009)).

The failure still has to mean something. A test that fails because a module does not exist
proves nothing: it would fail for a wrong story too. DISTILL therefore also writes the
**skeleton** the test calls — the signatures the contracts name, each returning the empty value
of its type, with no behaviour — so the test fails on a **business assertion**. Replacing the
missing module with a test double is refused: the skeleton is the real module, which DELIVER
will fill in.

## Scenarios kept in the repository

DISTILL writes its scenarios in `docs/features/<bounded-context>/<feature>.feature`, on the
story's branch: the pull request shows them, and the next runs read them. No test runner reads
these files; the acceptance test carries their values verbatim, and the `testability` lens checks
it (T2).

## What is not a scenario

A purely technical input case — a value of the wrong type, `NaN`, `null`, a number written as
text — has no unambiguous business wording. It never becomes a scenario: the test plan files it
as an inner-loop unit test, citing the DESIGN decision that refuses it. The scenarios stay
readable by the business, and the technical cases stay tested.

## Four views on the contract

Four lenses review the work: **coverage** (each criterion has its scenario, with its edge
cases), **business alignment** (no implementation detail in a step), **testability** (each step
can be implemented, the red is the right one), and **boundaries** (the acceptance test drives
only the use case, at least one walking skeleton per flow). The engine computes the verdict; a
`NEEDS_REWORK` sends the acceptance-designer back with the findings that stand.

## Sources

- [Adzic, G. *Specification by Example*, 2011.](../../reference/citations.mdx#cite-adzic-specification-2011)
- [Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.](../../reference/citations.mdx#cite-freeman-goos-2009)

## See also <!-- #see-also -->

- [Reference: DISTILL](../../reference/phases.md#distill) — outputs, write scope, commits.
- [Reference: DISTILL review criteria](../../reference/gates.md#distill).
- [Reference: durable documentation](../../reference/run-journal.md#durable-docs).
- [Walking Skeleton](../deep-dive/walking-skeleton.md) and
  [Outside-In TDD](../deep-dive/outside-in-tdd.md).
- [DELIVER](./deliver.md) — the next phase.
