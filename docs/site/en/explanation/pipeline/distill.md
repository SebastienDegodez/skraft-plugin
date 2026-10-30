---
layout: doc
lang: en
title: "DISTILL"
description: "Why DISTILL writes the executable contract before the code: scenarios in the business's language, an acceptance test that fails for the right reason, and a skeleton with no behaviour."
persona: software-engineer
---
{% assign cites = "/en/reference/citations" | relative_url %}

# DISTILL

{% include phase-ribbon.html current="distill" %}

> Write the contract before the code: DISTILL turns DESIGN's decisions into scenarios the
> business can read and an acceptance test that fails.

## Why this phase exists

An acceptance criterion in prose gets interpreted; an executable scenario does not. DISTILL turns
the expected behaviour into a **contract** between the business and the code: *Given / When /
Then* scenarios written in the story's vocabulary, and a test plan that places each behaviour at
the right level of the architecture. This is specification by example
([Adzic, 2011]({{ cites }}#cite-adzic-specification-2011)) carried all the way to the test.

The `acceptance-designer` that writes this contract does not write the implementation. By
separating the two, SKRAFT keeps one agent from fitting the test to its own code.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

The ADR and the event model enter. DISTILL writes the **Gherkin scenario**: "Given a cart with a
latte / When payment is approved / Then a receipt is issued and loyalty points are credited."
This scenario becomes the contract DELIVER must turn green.
</div>

## A red that proves something

DISTILL does not stop at scenarios: it writes the first acceptance test and commits it
**failing**. The engine replays that commit and checks the test really fails. This is the outer
loop of outside-in TDD: start with a test that describes what the system must do, seen from the
outside ([Freeman & Pryce, 2009]({{ cites }}#cite-freeman-goos-2009)).

The failure still has to mean something. A test that fails because a module does not exist
proves nothing: it would fail for a wrong story too. DISTILL therefore also writes the
**skeleton** the test calls — the signatures the contracts name, each returning the empty value
of its type, with no behaviour — so the test fails on a **business assertion**. Replacing the
missing module with a test double is refused: the skeleton is the real module, which DELIVER
will fill in.

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

## Going further

- [Reference: DISTILL]({{ "/en/reference/phases" | relative_url }}#distill) — outputs, write scope, commits.
- [Reference: DISTILL review criteria]({{ "/en/reference/gates" | relative_url }}#distill).
- [Walking Skeleton]({{ "/en/explanation/deep-dive/walking-skeleton" | relative_url }}) and
  [Outside-In TDD]({{ "/en/explanation/deep-dive/outside-in-tdd" | relative_url }}).
- [DELIVER]({{ "/en/explanation/pipeline/deliver" | relative_url }}) — the next phase.

## Sources

- [Adzic, G. *Specification by Example*, 2011.]({{ cites }}#cite-adzic-specification-2011)
- [Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.]({{ cites }}#cite-freeman-goos-2009)
