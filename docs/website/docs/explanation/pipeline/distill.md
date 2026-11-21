---
title: "DISTILL"
description: "Why DISTILL writes the contract before the code: business scenarios, and the acceptance test of every one failing for the right reason, read by a human."
persona: software-engineer
phase: distill
---

# DISTILL

Write the contract before the code: DISTILL turns DESIGN's decisions into scenarios the
business can read and, for every one of them, an acceptance test that fails.

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
unavailable drink cannot be added to the cart". In one commit it writes the failing walking
skeleton, from the ordering endpoint to the real database, and the failing acceptance test of S1
and of S2 through the use case; its implementation plan puts them in two groups, one per rule.
:::

## A red that proves something

In one pass DISTILL writes the scenarios, the test plan, the implementation plan, the
[walking skeleton](../deep-dive/walking-skeleton.md) and the acceptance test of every scenario,
and commits those tests **failing**, in one `test` commit whose message the brief gives
(`test(<story>): acceptance tests S1–S<n>`). Each acceptance test's name starts with its
scenario's number (`S2_…`, `test_s2_…`). The engine replays the commit with the component's test
command and keeps what it prints; when the tests fail, it replays them at the parent commit too,
and the [replay judge](pathname:///dashboard/#agent-replay-judge) reads both logs and the commit,
telling the scenarios apart by those names. The red stands only when every scenario's test fails
on an **assertion**; a red whose tests all pass is refused without asking the judge. This is the outer loop of
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

## Every scenario at once, delivered by group

The test plan lists the scenarios in a `## Scenarios` table, S1 to SN, in the order DELIVER builds
them, each in the one component where its test lives. S1, tagged `@walking-skeleton`, is the
scenario the walking skeleton walks: a plain test, with no Gherkin, that crosses a back-end
component from its real entry point to a real database and asserts the wiring only. S1 keeps its
own acceptance test, the binding of its Gherkin, through the use case like every scenario. A story
with no new entry point — a library, a refactoring, documents only — declares that exemption under
the table instead; it loses the walking skeleton, never an acceptance test.

The implementation plan groups the scenarios by the rule they pin down, in a
`| Group | Scenarios | … |` table: consecutive scenarios that enter through the same use case and
state one rule or its edge cases form one group, S1 in the first. DELIVER makes one group pass per
pass, with one green commit. A plan with no such table delivers one scenario per group.

Writing every test first costs one run of the suite instead of one per scenario, and the review
and the human read the whole contract at once. A test of a group not delivered yet stays red
until its green: its name, which starts with its scenario's number, is what lets the engineer's
test command leave it out and lets the replay judge tell it from a regression. The DISTILL review
and the human read that red once; the replay of each green, which must make its group pass while
keeping the walking skeleton and the groups before it green, checks the rest.

The brief also tells DISTILL what each component's tests run their dependencies on, in every
scenario's acceptance test (targeted, S1's included) and in the walking skeleton: the entry point in process or for real, internal
gateways in memory or in Testcontainers, external gateways on Microcks, the clock faked. That
[infrastructure policy](../../reference/skraft-config.md#infrastructure) comes from the plugin's
defaults per stack, which a team overrides per component in `skraft-config.json`. Why Microcks:
[Mocking with Microcks](../deep-dive/mocking-microcks.md).

## A human reads the scenarios

Before DELIVER builds anything, the run asks a human the `scenario-review` question: here are the
scenarios in order, S1 marked as the one the walking skeleton walks, the groups DELIVER builds them
in, the exemption the story declares if any, and the commit of the failing tests.
`APPROVED` lets DELIVER build them group by group; `REVISE` sends DISTILL back with the
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

Four lenses review the pass, once: **coverage** (each criterion has its scenario, with its edge
cases), **business alignment** (no implementation detail in a step), **testability** (each step
can be implemented, the reds are the right ones, the tests hold the walking skeleton and the
acceptance test of every scenario), and **boundaries** (the walking skeleton walks S1 from the real entry
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
