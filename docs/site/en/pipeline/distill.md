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
| **What exits** | Gherkin scenarios + implementation plan |
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

## Gates crossed here

This phase crosses gates **G1–G8** (see the [gates catalogue](../catalogue/gates.html)).
Each gate is checked by the independent reviewer before moving on to **DELIVER**.
