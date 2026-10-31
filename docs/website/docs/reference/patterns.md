---
layout: doc
lang: en
title: "Architecture patterns"
description: "The patterns structuring the DESIGN phase: Event Modeling, DDD, Clean Architecture, CQRS, Event Sourcing — with their reference."
---

# Architecture patterns

> Patterns do not stack at random. SKRAFT composes them in a precise order, each
> grounded in the book that defined it.

## Why — the problem it solves

Choosing an architecture "by feel" produces incoherent systems that are costly to
evolve. Relying on named patterns gives a **common language** and a **traceable
justification**: every structural decision points back to a known pattern and its
source.

## Key concepts — how it works

Mandated composition order: Event Modeling → DDD strategic → DDD tactical → Clean
Architecture → CQRS, with Event Sourcing at the Domain/Infrastructure boundary when
history has value.

| Pattern | In one sentence | Reference |
| --- | --- | --- |
| **Event Modeling** | Model the system as a sequence of events and commands before coding. | North, D., *Introducing BDD*, 2006. |
| **DDD strategic** | Split the domain into *bounded contexts* with a ubiquitous language per context. | Evans, E., *Domain-Driven Design*, 2003. |
| **DDD tactical** | Aggregates, value objects, domain events: the bricks that protect invariants. | Vernon, V., *Implementing Domain-Driven Design*, 2013. |
| **Clean Architecture** | Dependency rule: business never depends on infrastructure. | Martin, R. C., *Clean Architecture*, 2017. |
| **Hexagonal architecture** | Ports & adapters: isolate the domain behind interfaces. | Cockburn, A., *Hexagonal Architecture*, 2005. |
| **CQRS** | Separate the write model from the read model, *when a real problem justifies it*. | Fowler, M., *Bliki: CQRS*, 2011. |

Each complexity-adding pattern (CQRS, Event Sourcing, Saga…) is adopted only with an
explicit force and a "do without" alternative evaluated — that is a DESIGN-phase gate.

## Why this practice

> « The heart of software is its ability to solve domain-related problems for its user. »
> — Evans, E., *Domain-Driven Design*, 2003.

Patterns are not an end in themselves: they keep the domain model at the centre.

## Pitfalls & anti-patterns

- **Pattern-driven design**: adopting CQRS "because it is modern" without a concrete
  problem — the skill explicitly forbids it.
- **Big Design Up Front**: modelling the whole system before a single scenario exists
  — prefer the increment (see [walking skeleton]({{ "/en/explanation/deep-dive/walking-skeleton" | relative_url }})).

## Going further

- [The DESIGN phase]({{ "/en/explanation/pipeline/design" | relative_url }})
- [Clean Architecture]({{ "/en/explanation/clean-architecture" | relative_url }})
- [DESIGN gates](gates.html)

## Sources

- North, D. *Introducing BDD*, 2006.
- Evans, E. *Domain-Driven Design*, 2003.
- Vernon, V. *Implementing Domain-Driven Design*, 2013.
- Martin, R. C. *Clean Architecture*, 2017.
- Cockburn, A. *Hexagonal Architecture*, 2005.
- Fowler, M. *Bliki: CQRS*, 2011.

Terms to know: **bounded context**, **aggregate**, **value object**, **CQRS**,
**Event Sourcing** — see the [glossary]({{ "/en/reference/glossary" | relative_url }}).
