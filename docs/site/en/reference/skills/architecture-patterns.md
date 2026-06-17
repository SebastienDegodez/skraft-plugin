---
layout: doc
lang: en
title: "architecture-patterns"
description: "Use when selecting architecture patterns for a new feature, performing Event Modeling, defining bounded contexts, cho..."
persona: tech-lead
---

# architecture-patterns

> Catalogue of architectural patterns for Clean Architecture + DDD + Event-Driven systems: Event Modeling, DDD strategic design, DDD tactical patterns, CQRS, and Event Sourcing.

## When to use

- To select patterns suited to a new feature or story
- To perform Event Modeling and build the Command → Event → Read Model timeline
- To define bounded contexts and choose context mapping relationships
- To evaluate pattern fitness before deciding whether to produce an ADR

## Entry contract

- DISCUSS stories or requirements from the DESIGN phase
- Quality constraints (performance, evolvability, auditability)
- Project technical baseline (skills `clean-architecture-*`)

## Exit contract

- Annotated Event Model timeline (mermaid) with Commands, Events, and Read Models
- Justified selection of DDD tactical patterns (aggregates, entities, value objects, repositories)
- Context map with labelled relationships (ACL, Conformist, Open Host Service, Published Language, etc.)
- Selection justification for every complexity-adding pattern (CQRS+Bus, Event Sourcing, Saga)

## Invariants

- **YAGNI principle** — every pattern is justified by a story or quality attribute, not by preference
- **Composition order**: Event Modeling → DDD Strategic → DDD Tactical → Clean Architecture → CQRS
- **A Core subdomain is never Conformist** — it protects its Ubiquitous Language via an ACL
- **A local copy or translation is an ACL**, even a trivial one — never Conformist
- **Cross-aggregate references by ID only** — never by inter-aggregate object reference

**Mermaid notation for context mapping:**

```
graph LR
    EligibilityContext -->|ACL| PolicyContext
    PolicyContext -->|Conformist| BillingContext
    EligibilityContext -->|Published Language| NotificationContext
```

## Why this shape

Patterns are not ends in themselves: they are tools for communicating business invariants in code. Event Modeling starts the DESIGN session on the right foot by making the business fact timeline visible before any tactical decision.

> « The heart of software is its ability to solve domain-related problems for its user. »
> — Evans, E., *Domain-Driven Design*, 2003.

> « Separate the domain layer from the application, infrastructure, and presentation layers. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Allowed customisation

- Event Model diagram notation (L1)
- Subdomain classification (Core / Supporting / Generic) for the business context (L1)
- Additional patterns to include in the catalogue (L2)

## See also

- [architecture-decisions]({{ "/en/reference/skills/architecture-decisions" | relative_url }}) — ADRs for complexity-adding patterns
- [architecture-review-criteria]({{ "/en/reference/skills/architecture-review-criteria" | relative_url }}) — Gates that verify DDD and Clean Architecture compliance
- [solution-architect]({{ "/en/reference/agents/solution-architect" | relative_url }}) — Agent that applies this catalogue
