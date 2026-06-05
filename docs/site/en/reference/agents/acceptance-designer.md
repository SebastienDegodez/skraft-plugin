---
layout: doc
lang: en
title: "acceptance-designer"
persona: tech-lead
---

# acceptance-designer

> Transforms architecture decisions into executable BDD scenarios (Gherkin) and an implementation plan.

## When to use

- DISTILL phase of the pipeline
- After architecture validation by the solution-architect-reviewer
- Trigger: dispatch by the orchestrator

## Entry contract

- Approved ADRs and component diagrams (DESIGN validated)
- Refined story with acceptance criteria

## Exit contract

- `.feature` files (Gherkin Given-When-Then scenarios)
- Structured implementation plan
- Test-to-acceptance-criteria coverage matrix

## Invariants

- **Tests before code** — Acceptance scenarios exist before any implementation
- **Business language** — Scenarios use domain vocabulary, not technical vocabulary
- See [Customisation]({{ "/en/tutorials/customisation" | relative_url }}) for the full list

## Why this shape

BDD scenarios are executable specifications. They capture expected behaviour in a language shared between developers and domain experts, eliminating the ambiguity of textual specifications.

> « Specification by Example is a set of process patterns that facilitate change in software products. »
> — Adzic, G., *Specification by Example*, 2011.

Writing tests before code forces thinking about expected behaviour rather than implementation. This is the founding principle of TDD applied at the acceptance level.

> « Test-driven development is a way of managing fear during programming. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

## Allowed customisation

- Scenario depth (smoke vs exhaustive) (L2)
- Gherkin template and naming conventions (L1)
- Tags and scenario categorisation (L1)

## See also

- [acceptance-designer-reviewer]({{ "/en/reference/agents/acceptance-designer-reviewer" | relative_url }}) — DISTILL artifact review
- [Pipeline DISTILL]({{ "/en/explanation/pipeline/distill" | relative_url }}) — Phase description
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — Next phase (DELIVER)
