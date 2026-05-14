# Pattern Selection Matrix

## Overview

Use this table to determine which architectural pattern or combination of patterns to apply given a specific problem. Each row describes a problem, recommends a pattern, notes when NOT to apply it, and flags common mistakes.

After the decision table, the composition guide shows which patterns work well together.

---

## Decision Table

| Problem | Recommended Pattern | When NOT to use | Notes |
|---|---|---|---|
| Simple CRUD entity — create, read, update, delete with no complex rules | Clean Architecture + Repository | Do not add CQRS, Event Sourcing, or DDD Tactical overhead | Implement as a use case with a thin domain model; skip aggregates if there are no invariants |
| Complex business rules with non-trivial invariants | DDD Tactical: Aggregate + Specification | Do not use anemic domain model; do not put invariant logic in application services | Identify the consistency boundary first; invariants justify the aggregate |
| Regulatory or business audit trail required | Event Sourcing | Only apply if the history of state changes has real business value; do not apply to supporting or generic subdomains | Requires infrastructure investment; pair with an event store |
| Multiple diverging read models for the same data | CQRS with purpose-built projections | Not needed when the read and write shapes are nearly identical | Read models are disposable; they can be rebuilt from events or from the write database |
| Cross-aggregate coordination spanning multiple aggregates | Saga / Process Manager in Application layer | Do not put saga logic inside an aggregate; do not use distributed transactions | Sagas react to domain events; they issue commands but do not hold domain invariants |
| High read/write ratio with very different query shapes | CQRS with read-optimised projections and optionally separate read store | Do not apply to simple apps with modest read load; the operational cost must be justified | Start with simple CQRS (same database); move to separate stores only when read performance requires it |
| Complex domain requiring multiple teams and explicit language boundaries | DDD Strategic Design + Context Mapping | High coordination overhead for small teams or simple domains | Draw bounded context boundaries where the language changes; assign each context to a team |
| Event-driven integration between bounded contexts | Domain Events + Outbox Pattern | Do not use for in-process only; do not use ad-hoc event publishing without the outbox for external messaging | The outbox avoids dual-write; always pair external event publishing with the outbox |
| Uniqueness constraints in an event-sourced system | Reservation Pattern (separate reservation aggregate) | Not needed in state-based systems — the database handles uniqueness with unique indexes | Use when the uniqueness invariant cannot be enforced by a single aggregate's event stream |
| Multiple aggregates need the same information at different moments in time | Eventual consistency with domain events + projections | Do not use distributed transactions across aggregates | Design for eventual consistency; use causal consistency tokens if the UI needs read-your-own-writes |

---

## Pattern Fitness by Subdomain Type

| Subdomain | Pattern depth | Justification |
|---|---|---|
| Core | Full DDD (strategic + tactical) + CQRS + Event Sourcing (if audit trail) | Competitive advantage — high investment warranted |
| Supporting | Clean Architecture + Repository + simple CQRS if needed | Standard quality without DDD overhead |
| Generic | Thin wrapper around off-the-shelf solution | No domain investment; buy or use SaaS |

---

## Composition Guide

### Patterns That Combine Well

| Pattern A | Pattern B | Combination notes |
|---|---|---|
| Event Modeling | DDD Strategic Design | Event modeling identifies the language boundaries and aggregate candidates that strategic design formalises |
| DDD Strategic | DDD Tactical | Strategic design defines where boundaries are; tactical design fills in the aggregates, value objects, and events inside each context |
| DDD Tactical | Clean Architecture | Aggregates and domain events live in the Domain layer; use cases live in Application; repositories are implemented in Infrastructure |
| Clean Architecture | CQRS | CQRS sits inside Clean Architecture: command handlers and query handlers are Application-layer use cases |
| CQRS | Event Sourcing | Full CQRS is the natural companion to Event Sourcing: the event store is the command-side persistence; projections feed the query side |
| Event Sourcing | Sagas | Sagas react to events from the event store to coordinate cross-aggregate workflows |
| Domain Events | Outbox Pattern | External event publishing must always use the outbox to avoid dual-write |
| Aggregates | Specification | Specifications compose the complex business rules that aggregates delegate to for eligibility checks |

### Patterns That Do NOT Combine Well

| Pattern A | Pattern B | Why not |
|---|---|---|
| Event Sourcing | Generic subdomain | Overkill; a commodity service does not benefit from event history |
| Saga | Aggregate (merged) | Putting saga orchestration logic inside an aggregate couples cross-context coordination to a domain invariant — they have different lifecycles |
| CQRS (full, separate stores) | Simple CRUD | The operational complexity of separate stores is not justified for simple features |
| Shared Kernel | Frequently changing core domain | Shared Kernel requires coordinated changes — inappropriate for fast-moving core concepts |

---

## Anti-Engineering Escalator

Watch for this progression of over-engineering:

```
Simple feature
  → "Let's add CQRS" (no read/write divergence)
    → "Let's add Event Sourcing" (no audit requirement)
      → "Let's add a Saga" (no cross-aggregate workflow)
        → "Let's add a separate event store" (no temporal query need)
```

Each step must be justified by a concrete story or quality attribute requirement. If the justification is "we might need it later," do not add the pattern.
