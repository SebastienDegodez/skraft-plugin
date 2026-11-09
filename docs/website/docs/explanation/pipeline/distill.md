---
title: "DISTILL"
description: "Why DISTILL writes the contract before the code: business scenarios, one acceptance test failing for the right reason at a time, read by a human."
persona: software-engineer
phase: distill
---

# DISTILL

Write the contract before the code: DISTILL turns DESIGN's decisions into scenarios the
business can read and, one scenario at a time, an acceptance test that fails.

## Why this phase exists

An acceptance criterion in prose gets interpreted; an executable scenario does not. DISTILL turns
the expected behaviour into a **contract** between the business and the code: *Given / When /
Then* scenarios written in the story's vocabulary, and a test plan that places each behaviour at
the right level of the architecture. This is specification by example
([Adzic, 2011](../../reference/citations.mdx#cite-adzic-specification-2011)) carried all the way to the test.

The `acceptance-designer` that writes this contract does not write the implementation. By
separating the two, SKRAFT keeps one agent from fitting the test to its own code.

:::info[☕ Running example — Starbucks *(illustrative)*]

The ADR and the event model enter. DISTILL writes every scenario of the story, in the order
DELIVER will build them. S1, the walking skeleton: "Given a cart with a latte / When payment is
approved / Then a receipt is issued and loyalty points are credited", from the ordering endpoint
to the real database. S2: "an unavailable drink cannot be added to the cart". It commits the
failing acceptance test of S1 only; S2's test comes once S1 is green.
:::

## A red that proves something

On its first pass, DISTILL writes the scenarios, the test plan, and the acceptance test of the
first scenario, and commits that test **failing**, in one `test` commit whose message the brief
gives. The engine replays the commit and reads the test report the component's test command
writes: it accepts the red only when a test fails on an **assertion**. This is the outer loop of
outside-in TDD: start with a test that describes what the system must do, seen from the outside
([Freeman & Pryce, 2009](../../reference/citations.mdx#cite-freeman-goos-2009)).

The failure still has to mean something. A test that fails because a module does not exist
proves nothing: it would fail for a wrong story too, and it writes no test report, so the engine
refuses it. DISTILL therefore also writes the **skeleton** the test calls — the use cases the
event model names, each returning the empty value of its type, with no behaviour — so the test
fails on a **business assertion**. Replacing the missing module with a test double is refused:
the skeleton is the real module, which DELIVER will fill in. A test that errors, is skipped,
passes or never finishes is refused the same way.

The machine can also be the one at fault. When no container runtime answers, the tests that need
Docker or Podman cannot run: the engine says so and waits for a human to start one. The step is
neither skipped nor run against a double instead.

## One scenario at a time

The test plan lists the scenarios in a `## Scenarios` table, S1 to SN, in the order DELIVER builds
them, each in the one component where its test lives. S1 is the
[walking skeleton](../deep-dive/walking-skeleton.md): tagged `@walking-skeleton`, it crosses a
back-end component from its entry point to a real database. A story with no new entry point — a
library, a refactoring, documents only — declares that exemption under the table instead.

DISTILL writes the test of the scenario in progress only. A test written for a later scenario
would stay red through the whole delivery, and nothing would tell its red from a regression. So
after the DISTILL review and a human's reading, the engine alternates: DELIVER turns S1 green,
then DISTILL writes S2's failing test, DELIVER turns it green, and so on. Those later passes are
not reviewed again; the replay of each red, and the green that must make it pass, check them.

The brief also tells DISTILL what each component's tests run their dependencies on, in a
targeted scenario and in the walking skeleton: the entry point in process or for real, internal
gateways in memory or in Testcontainers, external gateways on Microcks, the clock faked. That
[infrastructure policy](../../reference/skraft-config.md#infrastructure) comes from the plugin's
defaults per stack, which a team overrides per component in `skraft-config.json`. Why Microcks:
[Mocking with Microcks](../deep-dive/mocking-microcks.md).

## A human reads the scenarios

Before DELIVER builds anything, the run asks a human the `scenario-review` question: here are the
scenarios in order, S1 marked as the walking skeleton, and the commit of S1's failing test.
`APPROVED` lets DELIVER build them one at a time; `REVISE` sends DISTILL back with the
corrections, which the human may also make in the `.feature` or the test first. Under Copilot,
as for the ratification of an ADR, only the host's dialog records the answer.

This is the cheapest point to correct the contract: every test that follows is written from it,
and a scenario missing now is a slice DELIVER cannot build later.

## Scenarios kept in the repository

DISTILL writes its scenarios where the component's `bdd` says, as
`<features folder>/<bounded-context>/<feature>.feature`, on the story's branch: the pull request shows them, and the next runs read them. No test runner reads
these files; the acceptance test carries their values verbatim, and the `testability` lens checks
it (T2).

A component says whether it describes its behaviour that way, with `bdd` in `skraft-config.json`
([skraft-config.json](../../reference/skraft-config.md#component)). It declares a practice, not a
bar: a component that leaves it on is held to its scenarios in full, and one that declines is
asked for no `.feature` — DISTILL takes its scenarios from the test plan's `Scenario` column
instead, and DELIVER's TDD runs exactly as it always does. An absent key means yes.

## What is not a scenario

A purely technical input case — a value of the wrong type, `NaN`, `null`, a number written as
text — has no unambiguous business wording. It never becomes a scenario: the test plan files it
as an inner-loop unit test, citing the DESIGN decision that refuses it. The scenarios stay
readable by the business, and the technical cases stay tested.

## Four views on the contract

Four lenses review the first pass, once: **coverage** (each criterion has its scenario, with its edge
cases), **business alignment** (no implementation detail in a step), **testability** (each step
can be implemented, the red is the right one, the test holds the scenario in progress only), and
**boundaries** (the acceptance test drives only the use case, at least one walking skeleton per
flow). The engine computes the verdict; a
`NEEDS_REWORK` sends the acceptance-designer back with the findings that stand. Its brief gives the
path of `acceptance-review-criteria`, the gates these lenses judge by: it checks its outputs
against every one before it writes its result.

## Sources

- [Adzic, G. *Specification by Example*, 2011.](../../reference/citations.mdx#cite-adzic-specification-2011)
- [Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.](../../reference/citations.mdx#cite-freeman-goos-2009)

## See also <!-- #see-also -->

- [Reference: DISTILL](../../reference/phases.md#distill) — outputs, write scope, commits.
- [Reference: DISTILL review criteria](../../reference/gates.md#distill).
- [Reference: durable documentation](../../reference/run-journal.md#durable-docs).
- [Walking Skeleton](../deep-dive/walking-skeleton.md) and
  [Outside-In TDD](../deep-dive/outside-in-tdd.md).
- [DELIVER](./deliver.mdx) — the next phase.
