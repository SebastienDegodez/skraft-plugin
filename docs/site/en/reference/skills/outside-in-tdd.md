---
layout: doc
lang: en
title: "outside-in-tdd"
persona: tech-lead
---

# outside-in-tdd

> TDD methodology that starts with acceptance tests (observable behaviour) and lets internal design emerge.

## When to use

- When implementing any feature in the DELIVER phase
- When tests should start from business behaviour, not technical details
- Before writing any production code: this skill carries the RED → SYNTHESIZE GREEN cycle

## Entry contract

- Approved BDD scenarios (`.feature` files)
- Defined architecture (ADRs, bounded contexts)

## Exit contract

- Passing acceptance tests
- Unit tests covering domain invariants
- Emergent design (no over-engineering)

## Invariants

- **Acceptance first** — The first test written is always an acceptance test
- **Walking Skeleton** — The first implementation cuts through all layers
- **Double loop** — Outer loop (acceptance) guides inner loop (unit)
- See [Customisation]({{ "/en/how-to/customisation" | relative_url }}) for the full list

## Why this shape

Outside-In TDD starts with what the system must do (observable behaviour) and descends to how it does it. The acceptance test is the first written, the last to pass.

> « Start with an acceptance test that exercises the functionality you want to build. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

This approach prevents over-engineering: only the code necessary to make the tests pass is written. Design emerges from actual needs, not hypotheses.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

## Allowed customisation

- Walking Skeleton depth (L2)
- Test double strategy per boundary (L2)
- Test naming conventions (L1)

## See also

- [clean-architecture-testing]({{ "/en/reference/skills/clean-architecture-testing" | relative_url }}) — Testing per layer
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — Agent that uses this skill
- [Core concepts — Walking Skeleton]({{ "/en/explanation/concepts" | relative_url }}) — Underlying principle
