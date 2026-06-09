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

## Test-wiring workers (fan-out B1)

When a slice needs **test infrastructure** rather than business logic,
the `software-engineer` dispatches to an internal worker, verifies the result,
integrates the emitted files into its own TDD loop, and commits.
The worker never commits.

| Need | Worker dispatched | What the worker emits |
|------|-------------------|-----------------------|
| Mock a downstream dependency the SUT calls (consumer-side) | `mock-integration-worker` | mock wiring + integration-test scaffold |
| Provider contract test for THIS service's API | `contract-testing-worker` | baseline WAF+HttpClient test (+ optional Microcks `TestEndpointAsync` layer) |

The `software-engineer` then drives its own RED → GREEN on the worker's files
(one-writer rule: `TIER-1 verify`).
The `software-engineer-reviewer` activates **conditional lenses** in mirror:
`mock-fidelity-lens` when the diff touches a downstream mock,
`contract-fidelity-lens` when it touches a contract or a provider test scaffold.

## Gates crossed here

This phase crosses the delivery gates — RED/GREEN test integrity, green build,
mutation score at threshold (see the [gates catalogue]({{ "/en/reference/gates" | relative_url }})).
The independent reviewer issues its verdict before the **PR** is opened.
