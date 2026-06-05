---
layout: doc
lang: en
title: "backlog-planner"
persona: tech-lead
---

# backlog-planner

> Refines triaged issues into structured stories with acceptance criteria, following INVEST principles.

## When to use

- DISCUSS phase of the pipeline
- After triage validation by the backlog-discoverer-reviewer
- Trigger: dispatch by the orchestrator

## Entry contract

- Triaged and approved issue (validated triage report)
- Project context (existing stories, milestone)

## Exit contract

- Refined user story with acceptance criteria
- Effort estimate and milestone assignment
- DoR (Definition of Ready) gate passed

## Invariants

- **INVEST quality** — Each story is Independent, Negotiable, Valuable, Estimable, Small, Testable
- **DoR gate** — 8 criteria to validate before moving to DESIGN
- See [Customisation]({{ "/en/customisation" | relative_url }}) for the full list

## Why this shape

The planner treats scope, time, and quality as conscious variables. Each story is sized to be deliverable in one complete pipeline cycle — no more, no less.

> « The best XP teams treat scope, time, cost, and quality as variables to be consciously managed. »
> — Beck, K., *Extreme Programming Explained, 2nd ed.*, 2004.

INVEST criteria ensure each story is testable and independent, a necessary condition for the pipeline to work as a flow.

## Allowed customisation

- Story and acceptance criteria templates (L1)
- Size and effort thresholds (L2)
- Additional DoR criteria (L2)

## See also

- [backlog-planner-reviewer]({{ "/en/reference/agents/backlog-planner-reviewer" | relative_url }}) — DISCUSS artifact review
- [Pipeline DISCUSS]({{ "/en/pipeline/discuss" | relative_url }}) — Phase description
- [solution-architect]({{ "/en/reference/agents/solution-architect" | relative_url }}) — Next phase (DESIGN)
