---
layout: doc
lang: en
title: "solution-architect"
persona: tech-lead
---

# solution-architect

> Designs software architecture via Event Modeling, strategic and tactical DDD, producing ADRs and component diagrams.

## When to use

- DESIGN phase of the pipeline
- After story validation by the backlog-planner-reviewer
- Trigger: dispatch by the orchestrator

## Entry contract

- Refined and approved story (DISCUSS validated)
- Existing architectural context (previous ADRs, bounded contexts)

## Exit contract

- Architecture Decision Records (ADRs)
- Component diagrams
- Event Model (commands, events, read models)
- Bounded context boundaries

## Invariants

- **Clean Architecture** — Dependencies point inward, never outward
- **One Use Case = one pass** — Each story is treated as a complete Use Case
- See [Customisation](/en/customisation) for the full list

## Why this shape

The architectural model is not a decorative diagram — it is a communication tool between developers and domain experts. The Event Model captures system behaviour in a shared language.

> « The model is a set of concepts built up in the heads of people on the project, with terms and relationships that reflect domain insight. »
> — Evans, E., *Domain-Driven Design*, 2003.

ADRs document decisions and their consequences, making architecture auditable and reversible.

> « Good architecture makes the system easy to understand, easy to develop, easy to maintain, and easy to deploy. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Allowed customisation

- Event Model depth (L2)
- ADR template (L1)
- Allowed DDD tactical patterns (L2)

## See also

- [solution-architect-reviewer](/en/reference/agents/solution-architect-reviewer) — DESIGN artifact review
- [Pipeline DESIGN](/en/pipeline/design) — Phase description
- [acceptance-designer](/en/reference/agents/acceptance-designer) — Next phase (DISTILL)
- [Architecture](/en/architecture) — Pipeline overview
