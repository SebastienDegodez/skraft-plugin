---
layout: default
lang: en
title: "DELIVER"
persona: software-engineer
---

# DELIVER

The DELIVER phase implements working code, guided by tests, with empirically verified quality.

## Mechanics

| | |
|---|---|
| **Entry trigger** | BDD scenarios (output of DISTILL) |
| **Output artefact** | Working code (Outside-In TDD, mutation tested) |
| **Responsible agent** | `software-engineer` |
| **Associated reviewer** | `software-engineer-reviewer` |

## Why this phase exists

Code is the only artefact that matters in production. The software-engineer applies Outside-In TDD: Acceptance Tests guide unit tests, which guide implementation. The Mutation Score verifies that tests genuinely protect behaviour. The reviewer is read-only — it never modifies code.

> « We grow working software, guided by tests, from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

## What the agent produces

- Code implemented following the RED → GREEN → REFACTOR cycle.
- Passing acceptance tests linked to Gherkin scenarios.
- Unit tests covering Domain invariants.
- Mutation Score as empirical proof of test quality.
