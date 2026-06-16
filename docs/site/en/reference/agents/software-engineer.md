---
layout: doc
lang: en
title: "software-engineer"
persona: tech-lead
---

# software-engineer

> Implements code via Outside-In TDD, starting with a Walking Skeleton and progressing to the required mutation score.

## When to use

- DELIVER phase of the pipeline
- After BDD scenario validation by the acceptance-designer-reviewer
- Trigger: dispatch by the orchestrator

## Entry contract

- Approved `.feature` files (DISTILL validated)
- Implementation plan
- Architecture decisions (ADRs)

## Exit contract

- Implemented code with all tests passing
- Mutation score above the configured threshold
- Artifacts committed on the working branch

## Invariants

- **Walking Skeleton first** — The first iteration cuts through all layers end to end
- **Mutation score floor** — Mutation score must exceed the minimum threshold
- **Outside-In TDD** — Acceptance tests → unit tests → implementation
- **Object Calisthenics** — Design constraints applied to business code
- **Test-wiring fan-out** — Delegates test wiring to the internal subagents `mock-integration-worker` and `contract-testing-worker` (`user-invocable: false`), verified in TIER-1 (RED → GREEN)
- See [Customisation]({{ "/en/how-to/customisation" | relative_url }}) for the full list

## Why this shape

Implementation starts with acceptance tests, not with code. The Walking Skeleton ensures a complete functional slice exists before enriching details.

> « A walking skeleton is a tiny implementation of the system that performs a small end-to-end function. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

The Outside-In TDD cycle (RED acceptance → RED unit → GREEN → REFACTOR) guides design emergence from observable behaviour to internal details.

> « Test-driven development is a way of managing fear during programming. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

Mutation testing verifies that tests actually detect defects, beyond simple line coverage.

> « Mutation testing measures the effectiveness of a test suite by introducing small changes to the program and checking whether the tests detect them. »
> — Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.

## Allowed customisation

- Mutation score threshold (L2)
- Enabled Object Calisthenics rules (L2)
- Walking Skeleton depth (L2)

## See also

- [software-engineer-reviewer]({{ "/en/reference/agents/software-engineer-reviewer" | relative_url }}) — DELIVER artifact review
- [software-engineer-and-reviewer]({{ "/en/reference/agents/software-engineer-and-reviewer" | relative_url }}) — Full DELIVER cycle
- [Pipeline DELIVER]({{ "/en/explanation/pipeline/deliver" | relative_url }}) — Phase description
- [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) — TDD skill
- [red-synthesize-green]({{ "/en/reference/skills/red-synthesize-green" | relative_url }}) — TDD cycle skill
