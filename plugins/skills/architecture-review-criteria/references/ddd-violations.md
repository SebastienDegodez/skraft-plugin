# DDD Violation Catalog

## Overview

Violations detectable in DESIGN artefacts — event models, ADRs, component diagrams, context maps, and interface contracts. Each entry explains how to detect the violation in artefacts (not in code) and what the correct approach looks like.

---

## V-DDD-01: Aggregate Crossing Bounded Context Boundary

**ID:** V-DDD-01
**Severity:** BLOCKER

**Description:** An aggregate defined in one bounded context is referenced or used directly by an aggregate in another bounded context, establishing a cross-context coupling at the model level.

**How to detect in artefacts:**
- Diagram shows an arrow from one bounded context's aggregate to another context's aggregate root (not an ID, a full object reference)
- Contracts show a command or use case that accepts an aggregate type from a different context as a parameter
- Context map shows a dependency without the appropriate relationship pattern (ACL, Conformist, OHS)

**Severity:** BLOCKER — violates bounded context isolation; makes independent evolution of contexts impossible.

**Correct approach:** Aggregates communicate only through domain events and ID references. If `PolicyContext` needs data from `EligibilityContext`, it subscribes to `EligibilityChecked` domain events and maintains its own derived state. It never imports the `EligibilityAggregate` type.

---

## V-DDD-02: Domain Event Raised from Application Service

**ID:** V-DDD-02
**Severity:** HIGH

**Description:** A domain event is raised by an application layer use case or command handler rather than by the aggregate root.

**How to detect in artefacts:**
- Contracts show a command handler with a method signature that explicitly creates and dispatches domain events
- Event model shows events with no corresponding aggregate listed as the source
- Diagram shows an arrow from an application use case directly to an event bus, bypassing the domain layer

**Severity:** HIGH — domain events must represent facts asserted by the domain, not by application orchestration. If the application service raises the event, the invariant that should have been enforced by the aggregate was bypassed.

**Correct approach:** The aggregate root emits domain events as part of its state-changing methods. The application service collects the events from the aggregate after the method call and publishes them via an event publisher interface.

**Auto-insurance example:**
```
// Violation: command handler emits domain event
CheckEligibilityCommandHandler.Handle():
  eligibility.Status = "Eligible"    ← application sets state directly
  _eventBus.Publish(new EligibilityChecked(...))  ← application raises event

// Correct: aggregate emits event
eligibility.Check(driverHistory, riskScore, requestedAt)
// → inside the aggregate: emits EligibilityChecked or EligibilityDenied
```

---

## V-DDD-03: Anemic Aggregate

**ID:** V-DDD-03
**Severity:** HIGH

**Description:** An aggregate contains only data properties and no business behaviour. All invariant logic lives outside the aggregate — in application services, helpers, or utility classes.

**How to detect in artefacts:**
- Diagram shows an aggregate with no method definitions — only property lists
- Contracts list aggregate methods as simple setters: `SetStatus(status)`, `SetValidUntil(date)`
- No Specifications or value objects appear alongside the aggregate in the design
- All invariant logic appears in command handler signatures rather than in the aggregate

**Severity:** HIGH — an anemic aggregate provides no protection against invalid state. Business rules are scattered and duplicated.

**Correct approach:** Aggregates expose behaviour-revealing methods that enforce invariants: `Check(history, score, requestedAt)`, `Expire()`, `Deny(reason)`. The aggregate's constructor or factory method validates creation invariants.

---

## V-DDD-04: Repository Defined in Domain Layer

**ID:** V-DDD-04
**Severity:** BLOCKER

**Description:** A repository interface is defined in the Domain layer rather than in the Application layer.

**How to detect in artefacts:**
- Contracts list `IEligibilityRepository` under Domain layer (not Application)
- Diagram shows an arrow from Domain to a repository interface that is positioned outside the Application layer
- ADR does not address where application interfaces are defined

**Severity:** BLOCKER — the Domain layer must have zero external dependencies. If a repository interface is in Domain, the Domain layer is coupled to the Application layer's abstraction, and the domain cannot be tested in isolation.

**Correct approach:** Repository interfaces belong in the Application layer. The Domain layer knows nothing about persistence — it raises events and enforces invariants. The Application layer defines the contract for fetching and saving aggregates.

---

## V-DDD-05: Cross-Aggregate Invariant Enforcement

**ID:** V-DDD-05
**Severity:** HIGH

**Description:** One aggregate enforces an invariant that involves data from another aggregate. This creates a coupling between aggregates that violates the consistency boundary principle.

**How to detect in artefacts:**
- Diagram shows one aggregate containing a direct reference to another aggregate's root entity (not an ID)
- Contracts show a domain method that accepts another aggregate root as a parameter: `EligibilityAggregate.Check(policy: PolicyAggregate)`
- ADR describes an invariant that spans two aggregates without identifying how eventual consistency will be handled

**Severity:** HIGH — cross-aggregate invariants require distributed consistency, which cannot be guaranteed without distributed transactions. This either creates a Fat Aggregate or causes data integrity issues.

**Correct approach:** Redesign the invariant to belong to one aggregate only. If the invariant genuinely spans contexts, it is a process-level invariant, not a domain invariant — implement it via a Saga that reacts to events from both aggregates.

---

## V-DDD-06: Missing Anti-Corruption Layer Between Conflicting Models

**ID:** V-DDD-06
**Severity:** HIGH

**Description:** A downstream bounded context adopts a Conformist relationship with an upstream that uses a conflicting or legacy model, when an Anti-Corruption Layer was required to protect the downstream's Ubiquitous Language.

**How to detect in artefacts:**
- Context map shows a `Conformist` label for a relationship where the upstream uses a different terminology (detectable by comparing context glossaries)
- Diagrams show upstream entity types (e.g., `LegacyContractRecord`) appearing inside the downstream context's aggregates or value objects
- No ACL adapter or translator appears in the downstream context's diagram

**Severity:** HIGH — the downstream domain is polluted by upstream concepts; the Ubiquitous Language is diluted; any change in the upstream leaks directly into the downstream domain.

**Correct approach:** Draw an explicit ACL layer in the downstream context. Map upstream types to downstream domain types at the context boundary. The downstream aggregate never sees the upstream type.

**Auto-insurance example:** Legacy system exposes `ContractRecord.RiskClass` (string). `EligibilityContext` should use `RiskScore` (value object, 0–100). Without an ACL, `RiskClass` appears in eligibility domain logic.

---

## V-DDD-07: God Aggregate

**ID:** V-DDD-07
**Severity:** HIGH

**Description:** An aggregate contains more than 3–5 child entities, enforces invariants across many unrelated concerns, and has grown into a "hub" that every other aggregate references.

**How to detect in artefacts:**
- Diagram shows an aggregate with 6+ distinct entity types as direct children
- The aggregate's interface definition in contracts has 15+ methods covering multiple unrelated concerns
- Multiple stories (from different business capabilities) all require changes to the same aggregate
- Other aggregates reference this aggregate by ID from many different use cases

**Severity:** HIGH — god aggregates cause lock contention, testing complexity, and deployment coupling. Every change requires reasoning about the entire aggregate's invariants.

**Correct approach:** Split by invariant ownership. Identify the minimal consistency boundary for each invariant cluster. Each cluster becomes its own aggregate. Use eventual consistency and domain events to coordinate between the smaller aggregates.

---

## V-DDD-08: Domain Service Doing What an Aggregate Should Do

**ID:** V-DDD-08
**Severity:** MEDIUM

**Description:** A Domain Service encapsulates logic that should belong to an aggregate — typically invariant enforcement or business rule execution that operates on a single aggregate's data.

**How to detect in artefacts:**
- Contracts list a `EligibilityCheckService` with a `Check(driverId, history, score)` signature that duplicates what the `EligibilityAggregate.Check()` method should do
- The domain service accesses aggregate internals that the aggregate itself should encapsulate
- The aggregate in the diagram has no behaviour methods — all behaviour is in the domain service (related to V-DDD-03)

**Severity:** MEDIUM — the aggregate loses its role as the invariant guardian; the service is a sign of an anemic aggregate.

**Correct approach:** Move the logic back into the aggregate. Domain Services are appropriate for logic that involves multiple aggregates or genuinely cross-cutting domain concerns. Single-aggregate logic belongs in the aggregate.
