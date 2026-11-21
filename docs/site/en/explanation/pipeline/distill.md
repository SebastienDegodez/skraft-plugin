---
layout: doc
lang: en
title: "DISTILL"
persona: software-engineer
---

# DISTILL

{% include phase-ribbon.html current="distill" %}

The DISTILL phase transforms architecture decisions into executable specifications.

## What enters, what exits

| | |
|---|---|
| **Comes from** | **DESIGN** — the ADR and the event model |
| **What enters** | Architecture decisions to specify |
| **What exits** | Gherkin scenarios + test plan + implementation plan + stack commands + RED acceptance tests |
| **Goes to** | **DELIVER** — which implements them with TDD |
| **Responsible agent** | `acceptance-designer` |
| **Associated reviewer** | `acceptance-designer-reviewer` |

## Why this phase exists

Gherkin scenarios serve as a contract between business and code. The acceptance-designer writes Given-When-Then scenarios that capture expected behaviour. The reviewer verifies that every acceptance criterion is covered and that scenarios are testable.

> « Specification by Example bridges the communication gap between business and technology. »
> — Adzic, G., *Specification by Example*, 2011.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

The ADR and event model enter. DISTILL writes the **Gherkin scenario**: “Given a cart with a latte / When payment is approved / Then a receipt is issued and loyalty points are credited.” This scenario becomes the contract DELIVER must turn green.
</div>

## What the agent produces

- `.feature` files in Gherkin format with Given-When-Then.
- Coverage matrix linking each acceptance criterion to a scenario.
- Implementation plan ordering tests by layer (Domain, Application, Infrastructure, API).
- Identification of Test Doubles needed at each boundary.
- `details/{date}/stack-commands.md`, when commands had to be resolved or corrected.
- The executable acceptance test of every scenario, each named after its scenario (`S4_…`), with the stubs they compile against, committed RED in one `test` commit.

## How DELIVER receives execution proof

DISTILL resolves build, test and mutation commands once into `stack-commands.md` instead
of leaving the engineer to rediscover them. It writes the acceptance test of every scenario, runs
them once and reads that each fails on a business assertion, then commits them in one `test`
commit: the RED of every scenario. No RED run is captured; the software engineer never writes
or edits an acceptance test.

## Reporting

DISTILL publishes no report. The QA reads the test plan the
[acceptance designer]({{ "/en/dashboard/#agent-acceptance-designer" | relative_url }})
writes and its reviewer approves; the one QA report is DELIVER's outcome: the tests
executed and, for a front end, the screenshots (see
[DELIVER]({{ "/en/explanation/pipeline/deliver" | relative_url }})).

## Gates crossed here

This phase crosses gates **G1–G8** (see the [gates catalogue]({{ "/en/reference/gates" | relative_url }})).
Each gate is checked by the independent reviewer before moving on to **DELIVER**.
