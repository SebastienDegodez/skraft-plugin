---
layout: doc
lang: en
title: "DELIVER"
persona: software-engineer
---

# DELIVER

{% include phase-ribbon.html current="deliver" %}

The DELIVER phase implements working code, guided by tests, with empirically verified quality.

## What enters, what exits

| | |
|---|---|
| **Comes from** | **DISTILL** — the Gherkin scenarios + the plan |
| **What enters** | Executable specifications to implement |
| **What exits** | Tested code + quality evidence (mutation, RED→GREEN) |
| **Goes to** | The **Pull Request** — human review then delivery |
| **Responsible agent** | `software-engineer` |
| **Associated reviewer** | `software-engineer-reviewer` |

## Why this phase exists

Code is the only artefact that matters in production. The software-engineer applies Outside-In TDD: Acceptance Tests guide unit tests, which guide implementation. The Mutation Score verifies that tests genuinely protect behaviour. The reviewer is read-only — it never modifies code.

> « We grow working software, guided by tests, from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

The scenario enters. DELIVER implements the total calculation and loyalty crediting in **RED → GREEN** cycles, then a **mutation score** attests that the tests genuinely protect the loyalty rule. The code goes to a Pull Request.
</div>

## What the agent produces

- Code implemented following the RED → GREEN → REFACTOR cycle.
- Passing acceptance tests linked to Gherkin scenarios.
- Unit tests covering Domain invariants.
- Mutation Score as empirical proof of test quality.

## The internal fan-out: test wiring

The `software-engineer` does not wire the integration tests by hand: it **delegates**
that wiring to internal subagents (`user-invocable: false`), one per capability.

| Capability | Worker | Strategy | Fidelity lens |
| --- | --- | --- | --- |
| Mocking (consumer) | `mock-integration-worker` | Microcks by default, overridable in-process | `mock-fidelity-lens` |
| Contract (provider) | `contract-testing-worker` | in-process integration + Microcks opt-in | `contract-fidelity-lens` |

Each worker emits test wiring only — the business TDD cycle stays with the lead, who
verifies the worker in **TIER-1** (the test fails first, then passes). When a
capability is active, its fidelity lens joins the adversarial panel of the
`software-engineer-reviewer`. The concrete wiring is resolved per stack through a
*roster* (see the [agentic catalogue]({{ "/en/dashboard/" | relative_url }})).

## Gates crossed here

This phase crosses the delivery gates — RED/GREEN test integrity, green build,
mutation score at threshold (see the [gates catalogue]({{ "/en/reference/gates" | relative_url }})).
The independent reviewer issues its verdict before the **PR** is opened.
