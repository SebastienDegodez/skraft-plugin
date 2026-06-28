---
layout: doc
lang: en
title: "architecture-decisions"
description: "Use when documenting architecture decisions as ADRs, evaluating trade-offs between alternatives, or managing the life..."
persona: tech-lead
---

# architecture-decisions

> Document, evaluate, and manage the lifecycle of Architecture Decision Records (ADRs) — the institutional memory of architectural choices, with trade-off analysis.

## When to use

- To document any decision that establishes or changes a layer boundary, chooses an aggregate boundary, or adopts a complexity-adding pattern (CQRS+Bus, Event Sourcing, Saga, ACL)
- To evaluate trade-offs between alternatives before the `Proposed → Accepted | Rejected` transition
- To manage lifecycle: supersession, deprecation, inter-ADR links

## Entry contract

- A story or measurable force that raised the question (required for any ADR)
- The current architectural context (DESIGN phase artefacts)
- The constraints and forces at play for the decision

## Exit contract

- ADR file named `adr-{NNN}-{slug}.md` at status `Proposed`
- Transition to `Accepted` or `Rejected` after human ratification (both commits are kept)
- For supersessions: update to `docs/adr/supersessions.md` registry AND the successor ADR

## Invariants

- **One ADR per decision** — one clear, single choice with trade-offs
- **Never encode verdict in the filename** — the slug names the subject, not the verdict
- **No ADR is ever deleted** — the historical record is as valuable as the decision itself
- **The `Proposed → Accepted | Rejected` ratification is owned by a human**, not the agent
- **A `Rejected` ADR is only admissible when a story in the batch raised the question**
- **Baseline conventions are not ADR topics** (e.g., CQS at method level, Clean Architecture layer boundaries)

**Lifecycle:**

```
Proposed → Accepted   → Deprecated
         ↘ Rejected   → Superseded by ADR-{NNN}
```

**Universal forces to evaluate:**

| Force | Question |
|---|---|
| Simplicity | Does this make the system easier to understand and change? |
| Consistency | Does this fit the patterns already established in this codebase? |
| Performance | Does this meet performance requirements without over-engineering? |
| Testability | Does this make automated testing easier or harder? |
| Evolvability | Does this simplify or constrain future changes? |

## Why this shape

ADRs reduce architectural debt cost by making the reasoning behind every structural choice explicit. Without them, teams re-run the same debates with the same arguments — without the original constraints that made them necessary.

> « Every pattern has a context, a problem, and a solution. Without the context, a pattern is a hammer looking for nails. »
> — Evans, E., *Domain-Driven Design*, 2003.

## Allowed customisation

- ADR template (L1)
- List of additional forces to evaluate (L2)
- Human ratification channel (L1 — the skill does not prescribe it)

## See also

- [architecture-patterns]({{ "/en/reference/skills/architecture-patterns" | relative_url }}) — Catalogue of patterns to document in ADRs
- [architecture-review-criteria]({{ "/en/reference/skills/architecture-review-criteria" | relative_url }}) — Gates G1, G2, G14, G15 verify ADRs
- [solution-architect]({{ "/en/reference/agents/solution-architect" | relative_url }}) — Agent that produces ADRs
