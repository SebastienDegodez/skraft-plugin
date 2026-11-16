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
DELIVER will build them. S1, the one the walking skeleton walks: "Given a cart with a latte / When
payment is approved / Then a receipt is issued and loyalty points are credited". S2: "an
unavailable drink cannot be added to the cart". It first commits the failing walking skeleton,
from the ordering endpoint to the real database, then, on its own pass, the failing acceptance
test of S1 through the use case; S2's test comes once S1 is green.
:::

## A red that proves something

On its first pass, the plan pass, DISTILL writes the scenarios, the test plan and the
[walking skeleton](../deep-dive/walking-skeleton.md), and commits that test **failing**, in one
`test` commit whose message the brief gives (`test(<story>): walking skeleton of …`). On the pass
that follows, "scenario 1 of N", it writes S1's acceptance test and commits it failing too, in its
own `test` commit. The engine replays each commit with the component's test command and keeps what it
prints; when the tests fail, it replays them at the parent commit too, and the
[replay judge](pathname:///dashboard/#agent-replay-judge) reads both logs and the commit. The red
stands only when the commit's test fails on an **assertion**; a red whose tests all pass is
refused without asking the judge. This is the outer loop of
outside-in TDD: start with a test that describes what the system must do, seen from the outside
([Freeman & Pryce, 2009](../../reference/citations.mdx#cite-freeman-goos-2009)).

The failure still has to mean something. A test that fails because a module does not exist
proves nothing: it would fail for a wrong story too, before any assertion runs, so the judge
sends it back. DISTILL therefore also writes the **skeleton** the test calls — the use cases the
event model names, each returning the empty value of its type, with no behaviour; for the walking
skeleton, every class of the chain it crosses (entry point, use case, ports, adapters, wiring),
reusing what exists — so the test fails on an **assertion**. Replacing the missing module with a test double is refused:
the skeleton is the real module, which DELIVER will fill in. A test that errors, is skipped,
passes or never finishes is refused the same way.

The machine can also be the one at fault. When no container runtime answers, the tests that need
Docker or Podman cannot run: the judge reads it in the log and asks a human to start one. The step is
neither skipped nor run against a double instead.

## One scenario at a time

The test plan lists the scenarios in a `## Scenarios` table, S1 to SN, in the order DELIVER builds
them, each in the one component where its test lives. S1, tagged `@walking-skeleton`, is the
scenario the walking skeleton walks: a plain test, with no Gherkin, that crosses a back-end
component from its real entry point to a real database and asserts the wiring only. S1 keeps its
own acceptance test, the binding of its Gherkin, through the use case like every scenario. A story
with no new entry point — a library, a refactoring, documents only — declares that exemption under
the table instead; it loses the walking skeleton, never S1's acceptance test, and its plan pass
commits its `.feature` files as `docs(<story>): …`.

Every scenario starts tagged `@pending`; the red of each scenario removes the tag from that
scenario alone, and the component's Gherkin runner selects `not @pending`, so a scenario whose
test is not written yet never runs red. `@walking-skeleton` is never excluded.

DISTILL writes the test of the scenario in progress only. A test written for a later scenario
would stay red through the whole delivery, and nothing would tell its red from a regression. So
after the DISTILL review and a human's reading, the engine alternates: DELIVER turns S1 green —
S1's acceptance test and the walking skeleton both pass —, then DISTILL writes S2's failing test, DELIVER turns it green, and so on. Those later passes are
not reviewed again; the replay of each red, and the green that must make it pass while keeping
the walking skeleton green, check them.

The brief also tells DISTILL what each component's tests run their dependencies on, in every
scenario's acceptance test (targeted, S1's included) and in the walking skeleton: the entry point in process or for real, internal
gateways in memory or in Testcontainers, external gateways on Microcks, the clock faked. That
[infrastructure policy](../../reference/skraft-config.md#infrastructure) comes from the plugin's
defaults per stack, which a team overrides per component in `skraft-config.json`. Why Microcks:
[Mocking with Microcks](../deep-dive/mocking-microcks.md).

## A human reads the scenarios

Before DELIVER builds anything, the run asks a human the `scenario-review` question: here are the
scenarios in order, S1 marked as the one the walking skeleton walks, the commit of the failing
walking skeleton (or the exemption the story declares) and the commit of S1's failing acceptance
test.
`APPROVED` lets DELIVER build them one at a time; `REVISE` sends DISTILL back with the
corrections, which the human may also make in the `.feature` or the tests first. Under Copilot,
as for the ratification of an ADR, only the host's dialog records the answer.

This is the cheapest point to correct the contract: every test that follows is written from it,
and a scenario missing now is a slice DELIVER cannot build later.

The designer runs those same mechanical checks itself, during its attempt, with
`skraft_precheck`: the `.feature` files its plan names and the working copy has not got, a
criterion no scenario answers, a file it left uncommitted, each come back with the check that found
it, so the pass is corrected on the spot instead of costing a replay of the whole red commit. The
pre-check reads none of its commits, starts no agent and approves nothing — the engine checks again
when the step is submitted, and the lenses still review.

## Scenarios kept in the repository

DISTILL writes its scenarios where the component's `bdd` says, as
`<features folder>/<bounded-context>/<feature>.feature`, on the story's branch: the pull request shows them, and the next runs read them. When the component
declares a Gherkin runner, each scenario's acceptance test is the binding of these files; either
way it carries their values verbatim, and the `testability` lens checks it (T2).

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

Four lenses review the plan pass and S1's pass, once: **coverage** (each criterion has its scenario, with its edge
cases), **business alignment** (no implementation detail in a step), **testability** (each step
can be implemented, the reds are the right ones, the tests hold the walking skeleton and the
scenario in progress only), and **boundaries** (the walking skeleton walks S1 from the real entry
point, each acceptance test drives only the use case). The engine computes the verdict; a
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
