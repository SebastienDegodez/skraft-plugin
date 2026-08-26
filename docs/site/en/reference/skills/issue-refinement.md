---
layout: doc
lang: en
title: "issue-refinement"
description: "Use when transforming raw issues or feature requests into well-structured user stories with acceptance criteria. Cove..."
persona: tech-lead
---

# issue-refinement

> Transforms raw GitHub issues or feature requests into well-structured user stories with acceptance criteria, applied in the DISCUSS phase.

## When to use

- Transforming a raw issue into an implementable user story
- Checking INVEST compliance of an existing story
- Detecting the 8 story antipatterns (Implement-X, Vague Persona, etc.)
- Applying a splitting pattern (by workflow step, business rule, data variation, interface, AC, happy/sad path)
- Validating the 8 DoR (Definition of Ready) items before entering the DESIGN phase

## Entry contract

- Raw GitHub issue or story in progress
- Triaged and prioritised (issue that has passed the DISCOVER phase)

## Exit contract

- User story in the format `As a {persona}, I want {capability}, so that {benefit}`
- ≥ 3 acceptance criteria in Given/When/Then or bullet-list format
- DoR 8 items validated
- Effort estimate in Fibonacci points (1, 2, 3, 5, 8 — 13 and 21 forbidden without splitting)

## Invariants

- **Story is a unit of value** — A story is NOT a task, a ticket, or a technical instruction
- **Specific persona** — never "a user", "someone", or "the system"
- **Capability = observable behaviour** — never `implement`, `create`, `call`, `build` as the capability
- **Above 8 points = must be split before DoR** — Any story estimated 13 or 21 cannot reach `status/ready`
- **6 INVEST criteria** — Independent, Negotiable, Valuable, Estimable, Small, Testable — all must pass

## Why this shape

The DISCUSS phase produces stories, not technical specifications. A well-formed story aligns the team on the value to deliver without prescribing implementation. Acceptance criteria derived from domain examples ensure that expected behaviour can be validated by a domain expert with no code knowledge.

> « The goal of refinement is shared understanding, not a perfect document. »

The 6 splitting patterns (by workflow step, business rule, data variation, interface, AC, happy/sad path) allow any 13- or 21-point story to be reduced into independently deliverable 2- to 5-point stories.

## Allowed customisation

- User story template (L1)
- Additional splitting patterns (L2)
- Minimum AC threshold (default: 3) (L2)

## See also

- [issue-triage]({{ "/en/reference/skills/issue-triage" | relative_url }}) — DISCOVER phase: classification before refinement
- [planning-review-criteria]({{ "/en/reference/skills/planning-review-criteria" | relative_url }}) — Gates G1–G8 that evaluate the quality of produced stories
- [bdd-methodology]({{ "/en/reference/skills/bdd-methodology" | relative_url }}) — Gherkin format for acceptance criteria
- [backlog-planner]({{ "/en/reference/agents/backlog-planner" | relative_url }}) — DISCUSS agent that uses this skill
