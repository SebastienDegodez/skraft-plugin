---
name: architecture-patterns
description: Use when selecting architecture patterns for a new feature, performing Event Modeling, defining bounded contexts, choosing DDD tactical patterns, evaluating pattern fitness, or understanding how patterns compose. Covers Event Modeling methodology, DDD strategic design, DDD tactical patterns, Clean Architecture, CQRS, and Event Sourcing.
---

# Architecture Patterns

## Overview

A catalogue of architectural patterns used in Clean Architecture + DDD + Event-Driven systems.

**Core principle:** Patterns are tools — select based on problem, not preference. Every pattern added to a design must be justified by a story or a quality attribute requirement. YAGNI applies to architecture.

The patterns in this skill compose in a specific order: Event Modeling → DDD Strategic → DDD Tactical → Clean Architecture → CQRS, with Event Sourcing applied at the Domain/Infrastructure boundary when history has value.

---

## Event Modeling

BDD-first methodology to model system behaviour as a timeline of events. It is the starting point for every DESIGN session.

### Core Concepts

| Concept | Definition | Example |
|---|---|---|
| **Command** | An expression of user or system intent. Imperative mood. May be rejected. | `CheckEligibility`, `SubmitApplication` |
| **Event** | An immutable fact that records a state change. Past tense. Cannot be rejected. | `EligibilityChecked`, `ApplicationSubmitted` |
| **Read Model** | A query output optimised for a specific view. No mutation. | `EligibilityResult`, `ApplicationSummary` |

### Timeline Structure

Commands cause Events. Events update Read Models. The timeline reads left to right:

```
[Command] → [Event] → [Read Model]
```

Each vertical grouping of Command + Event + Read Model is a **Slice** — the minimum unit of deliverable business value.

Read [references/event-modeling.md](references/event-modeling.md) for the procedure that builds a timeline from stories, the colour convention and worked examples.

### Mermaid Notation

```
timeline
    title Eligibility Check — Event Timeline
    section Command
        CheckEligibility : Submitted by Driver
    section Event
        EligibilityChecked : Raised by EligibilityAggregate
    section Read Model
        EligibilityResult : Consumed by Driver UI
```

### Relationship to Gherkin

Each slice maps to one or more Gherkin scenarios:
- The **Given** clause describes the pre-existing state (often a prior event)
- The **When** clause maps to the **Command**
- The **Then** clause maps to the **Event** and/or **Read Model** outcome

### Common Mistakes

| Mistake | Why it matters | Fix |
|---|---|---|
| Modelling implementation steps instead of business events | Creates a technical model, not a business model | Reframe in past tense business facts |
| Missing Read Models | Queries become undefined; DISTILL phase can't produce query scenarios | Identify every query the user needs before acting |
| Too many aggregates | Inflates complexity; over-splits consistency boundaries | Group events that must be consistent with each other |
| Commands that cannot fail | Suggests you are modelling state changes, not intent | All commands can be rejected — model the rejection event |

---

## DDD Strategic Design

### Bounded Contexts

A Bounded Context is the explicit boundary within which a domain model applies. Within the boundary, every term in the Ubiquitous Language has exactly one meaning.

**Identification heuristics:**
- Different teams → likely different contexts
- Same word, different meaning → definitely different contexts
- Different rate of change → consider separate contexts
- Separate database or deployment → natural context boundary

### Context Mapping Patterns

Upstream/Downstream, Conformist, Anti-Corruption Layer (ACL), Shared Kernel, Partnership, Open Host Service, Published Language. Read [references/ddd-strategic.md](references/ddd-strategic.md) for when to use each, its risk and the common strategic mistakes.

### Context Mapping Selection Rules

Apply these rules **before** labelling any arrow on the context map. They constrain which relationship is admissible, independently of how trivial the integration looks today.

**Rule 1 — A Core subdomain is never Conformist.** Conformist means the downstream submits to the upstream's model with no isolation layer, surrendering control of its own Ubiquitous Language. That is acceptable only for **Supporting** or **Generic** downstreams that cannot justify the translation cost. A **Core** subdomain is the competitive advantage; its language must be protected from upstream pollution. If the downstream is Core, the relationship is an **ACL** (ideally with the upstream exposing an Open Host Service / Published Language) — never Conformist.

**Rule 2 — Consuming a published contract is not Conformist.** Conformist requires consuming the upstream's *internal domain model* directly. If the upstream exposes a stable, simplified, public contract (a ViewModel, an event schema, a DTO) and hides its domain entities, the upstream is providing an **Open Host Service + Published Language**. The downstream reading that contract is *not* conformist to the upstream domain.

**Rule 3 — A local copy or translation is an ACL.** If the downstream keeps its own copy of the consumed data, or translates the upstream contract into its own types at the boundary — even a trivial translation such as reading a single boolean — that boundary **is** an Anti-Corruption Layer (Translation Layer). "The translation is trivial today" does not downgrade it to Conformist; the protection is structural, not proportional to current translation effort.

**Decision table — Conformist vs ACL vs OHS/PL:**

| Observation in the design | Correct label |
|---|---|
| Downstream imports upstream domain entities directly, no translation layer | **Conformist** (admissible only when downstream is Supporting/Generic) |
| Upstream exposes a stable public contract (ViewModel/event/DTO), hides its domain | **Open Host Service + Published Language** (upstream side) |
| Downstream translates or copies that contract into its own types at the boundary | **Anti-Corruption Layer** (downstream side) |
| Downstream is a **Core** subdomain | **ACL** — Conformist is forbidden regardless of translation effort |

### Subdomain Classification

| Subdomain | Definition | Investment | Examples in auto insurance |
|---|---|---|---|
| **Core** | The competitive advantage of the business | Build, invest, DDD deep dive | Eligibility engine, risk scoring |
| **Supporting** | Necessary but not differentiating | Build or buy, standard patterns | Document management, notifications |
| **Generic** | Commodity functionality | Buy or use off-the-shelf | Authentication, payment processing |

### Ubiquitous Language

- Every term means the same thing within a bounded context
- The same term may mean something different in another context — this is correct
- Document the language in a glossary per context
- Code, tests, and documentation use the same terms — no translations inside a context

### Context Map Mermaid Notation

```
graph LR
    EligibilityContext -->|ACL| PolicyContext
    PolicyContext -->|Conformist| BillingContext
    EligibilityContext -->|Published Language| NotificationContext
```

---

## DDD Tactical Patterns

### Aggregate

**Definition:** A cluster of entities and value objects with a consistency boundary. Changes are always atomic within an aggregate.

**Rules:**
- One root entity (the Aggregate Root) — all external access goes through the root
- Consistency boundary: invariants are enforced within the aggregate, never across aggregates
- One Repository per aggregate
- Reference other aggregates by ID only — never hold a reference to another root

**Size guideline:** Prefer small aggregates. Large aggregates cause contention and complexity. If an aggregate has more than 3–5 entities, consider splitting.

**Auto-insurance example:** `EligibilityAggregate` — root is `Eligibility`, contains `DriverHistory`, `RiskScore`. It enforces the invariant: "An eligible driver must have fewer than 3 accidents in 5 years."

### Entity

**Definition:** An object with a distinct identity that persists over time. Two entities with the same data are still different entities if their IDs differ.

- Identity types: natural key (e.g., `DriverId`), surrogate key (UUID)
- Mutable state — entities change over their lifecycle

### Value Object

**Definition:** An object that has no conceptual identity. Two value objects with the same data are equal.

- Immutable — never modified after creation
- Equality by value, not by reference
- Self-validating — construction fails if invariants are violated
- Prefer value objects over primitives — `RiskScore` instead of `int`

**Auto-insurance example:** `RiskScore(value: 75)`, `DriverId(value: "DRV-001")`, `DateRange(from, to)`

### Domain Event

**Definition:** An immutable record of something that happened in the domain. Past tense. Raised by an aggregate root.

- Naming: past tense verb phrase — `EligibilityChecked`, NOT `EligibilityCheckEvent`
- Payload: minimal and immutable — only the facts needed to understand what happened
- Raised after state change is committed (inside the aggregate, after invariant enforcement)
- Used for cross-aggregate communication and integration

### Repository

**Definition:** Abstracts the storage mechanism for an aggregate.

- One per aggregate — `IEligibilityRepository`, not `IGenericRepository<T>`
- Interface defined in Domain when it persists an aggregate, Application for a CRUD entity or a read model — never Infrastructure; the contracts record the layer, never an ADR
- No ORM/LINQ leakage in the interface — domain-friendly method names (`GetEligibleDrivers`, not `FindAll(x => x.Status == "Eligible")`)

### Domain Service

**Definition:** Stateless logic that doesn't naturally belong to an aggregate or value object.

**When to extract:**
- Logic involves multiple aggregates but doesn't belong to either
- Logic involves external lookups that the domain needs

**When NOT to extract:**
- Logic can live in an aggregate method — keep it there
- Logic is purely infrastructural — put it in the Application layer

### Specification

**Definition:** Encapsulates a business rule as a predicate. Composable with `And`, `Or`, `Not`.

**Best use:** Complex eligibility rules — compose `HasCleanRecord.And(HasMinimumExperience).And(IsLicenceValid)`.

---

## Clean Architecture

### Layer Structure

```
┌────────────────────────────────────┐
│ API / Presentation                 │  ← Controllers, DTOs, ViewModels
├────────────────────────────────────┤
│ Application                        │  ← Use Cases, Commands, Queries
│                                    │     Application Interfaces (I*Repository, I*Publisher)
├────────────────────────────────────┤
│ Domain                             │  ← Aggregates, Entities, Value Objects,
│                                    │     Domain Events, Domain Services
├────────────────────────────────────┤
│ Infrastructure                     │  ← Persistence, Messaging, External APIs
│                                    │     Implements Application Interfaces
└────────────────────────────────────┘
```

### Dependency Rule

**Project references point inward only, one layer at a time.**

- Domain → references nothing
- Application → references Domain only
- Infrastructure → references Application only (implements its interfaces)
- API → references Infrastructure only (composes use cases through it)

Types reachable through a transitive reference may be imported; never add a direct reference to reach them.

### Feature Folders

Inside each layer, code is grouped by feature (`Loans`, `Invoicing`), never by technical kind (`Repositories`, `Services`, `Persistence`). A feature's use cases import no other feature's application code; what two features both need moves to a `Shared` folder of that layer.

### Use Case Boundary

The Application layer is the entry point for all external requests. Controllers never touch Domain objects directly — they go through use cases.

### Application Interface

Any I/O abstraction (message publisher, external gateway, read model) is defined as an interface in the Application layer; a repository follows the Repository rule above. Infrastructure provides the implementation. This keeps the Application layer testable without real infrastructure.

---

## CQRS

### Definition

Command Query Responsibility Segregation separates the model used to handle commands (mutations) from the model used to handle queries (reads).

### When to Apply

| Signal | Apply CQRS? |
|---|---|
| Read and write models have different shapes | Yes |
| High read/write ratio | Yes |
| Complex reporting or projection needs | Yes |
| Simple CRUD with no diverging read/write concerns | No — over-engineering |
| Requirement is to "use CQRS" without a concrete problem | No — justify with a problem |

### Command Side

- Mutates state
- Raises domain events
- Returns minimal data (acknowledgment, not a view)

### Query Side

- Optimised read models — shaped for the consumer
- No mutation
- Can use a different database, cache, or projection

### Simple vs Full CQRS

| Variant | Description | When |
|---|---|---|
| Simple CQRS | Same database, separate command and query models | Most cases |
| Full CQRS | Separate stores (event store for commands, read DB for queries) | When Event Sourcing is also adopted |

Read [`references/read-store-pattern.md`](references/read-store-pattern.md) when deciding whether a use case should call the repository or a dedicated read-side interface (`IXxxReadStore`), or when the question is "who maps the aggregate to a ViewModel".

---

## Event Sourcing

### Decision Heuristic

> **Ask: "Does knowing the history of state changes provide business value?"**
> If NO → do NOT use Event Sourcing.

### Use When

- Audit trail is a regulatory or business requirement
- Temporal queries are needed ("What was the eligibility status on 2025-01-15?")
- Multiple diverging read models of the same data are needed
- Complex DDD domains where history enables better invariant enforcement
- Event-driven integration where events are the API

### Do NOT Use When

- Simple CRUD with no audit requirement
- No temporal query need
- Team is unfamiliar with the pattern and there is no time to learn
- The domain is Generic or Supporting (commodity functionality)

Read [references/event-sourcing.md](references/event-sourcing.md) once Event Sourcing is chosen: aggregate event lifecycle, event store, projections, snapshots, upcasting, conflict resolution, eventual consistency, the outbox and reservation patterns.

### Sagas / Process Managers

Coordinate cross-aggregate workflows. Sit in the Application layer.

- React to domain events
- Issue commands to other aggregates
- Maintain their own process state (saga state is persisted)
- Are NOT aggregates — they are Application-layer orchestrators

**Example:** `EligibilityRenewalSaga` — listens for `EligibilityExpired` event, issues `RenewEligibility` command to `EligibilityAggregate`, then `NotifyDriver` command to `NotificationAggregate`.

---

## Pattern Composition

Patterns compose in a specific order. Start from the outside and work inward:

```
Event Modeling (what the system does)
  → DDD Strategic Design (where the boundaries are)
    → DDD Tactical Design (what the domain model looks like)
      → Clean Architecture (how layers are structured)
        → CQRS (how commands and queries are separated)
          → Event Sourcing (how state is persisted, when history matters)
            → Sagas (how cross-aggregate workflows are coordinated)
```

**Key composition rules:**
- Event Sourcing applies at the Domain/Infrastructure boundary — only when the decision heuristic says yes
- Sagas sit in the Application layer — never embed saga logic in an aggregate
- CQRS and Event Sourcing often appear together but are independent — you can use CQRS without Event Sourcing

---

## Decision Matrix

Read [references/pattern-selection-matrix.md](references/pattern-selection-matrix.md) when selecting a pattern for a problem type: the recommended pattern, when not to use it, and how patterns compose.

---

## References

- [event-modeling.md](references/event-modeling.md) — Full Event Modeling methodology and notation guide
- [ddd-strategic.md](references/ddd-strategic.md) — Bounded context identification, context mapping, subdomain classification
- [ddd-tactical.md](references/ddd-tactical.md) — Aggregate, Entity, Value Object, Domain Event, Repository, Specification
- [pattern-catalog.md](references/pattern-catalog.md) — Clean Architecture layers and CQRS pattern details
- [pattern-selection-matrix.md](references/pattern-selection-matrix.md) — Decision table by problem type + composition guide
- [anti-patterns.md](references/anti-patterns.md) — 10 architecture anti-patterns with root causes and fixes
- [event-sourcing.md](references/event-sourcing.md) — Complete Event Sourcing guide: aggregate lifecycle, projections, sagas, upcasting
