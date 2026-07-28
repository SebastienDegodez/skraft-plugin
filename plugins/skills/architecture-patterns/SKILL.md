---
name: architecture-patterns
description: Use when selecting architecture patterns for a new feature, performing Event Modeling, defining bounded contexts, choosing DDD tactical patterns, evaluating pattern fitness, judging whether a coupling decision is balanced, or understanding how patterns compose. Covers Event Modeling methodology, DDD strategic design, the Balanced Coupling model (integration strength, distance, volatility), DDD tactical patterns, Clean Architecture, CQRS, and Event Sourcing.
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

### How to Build a Timeline from Stories

1. **Brainstorm Events** from stories. Ask: "What facts must be recorded?" Write events on sticky notes.
2. **Group by aggregate or context.** Events that share a consistency boundary belong to the same aggregate.
3. **Identify Commands** that cause each event. Ask: "What action triggered this fact?"
4. **Identify Read Models** consumed before each command. Ask: "What does the user need to see before they act?"
5. **Define Slices.** One slice = one command + its resulting event(s) + the read model that surfaces the result.

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

**Colour coding convention (for tooling that supports it):**
- Commands → blue
- Events → orange
- Read Models → green

### Relationship to Gherkin

Each slice maps to one or more Gherkin scenarios:
- The **Given** clause describes the pre-existing state (often a prior event)
- The **When** clause maps to the **Command**
- The **Then** clause maps to the **Event** and/or **Read Model** outcome

### Auto-Insurance Domain Example

**Eligibility Check flow:**
- Command: `CheckEligibility` (Driver, driverId, requestedAt)
- Event: `EligibilityChecked` (driverId, result: Eligible|Ineligible, reason?)
- Read Model: `EligibilityResult` (eligible: bool, validUntil?, rejectionReason?)

**Application Submission flow:**
- Command: `SubmitApplication` (applicantId, policyType, vehicleInfo)
- Event: `ApplicationSubmitted` (applicationId, submittedAt, status: Pending)
- Read Model: `ApplicationStatus` (applicationId, status, submittedAt)

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

| Pattern | Relationship | When to use | Risk |
|---|---|---|---|
| **Upstream/Downstream** | One context feeds another | When one context's model drives another's | Downstream is coupled to upstream changes |
| **Conformist** | Downstream adopts upstream's model | When upstream is powerful and the cost of translation is too high | Downstream polluted by upstream concepts |
| **Anti-Corruption Layer (ACL)** | Downstream translates upstream's model | When upstream uses a different or legacy model | Translation cost; must be maintained |
| **Shared Kernel** | Two contexts share a subset of the domain model | Small shared concepts between close teams | Changes to shared kernel must be agreed by both teams |
| **Partnership** | Two contexts co-evolve | Equal teams with strong alignment | High coordination overhead |
| **Open Host Service** | Upstream publishes a versioned API | When many downstreams consume the same upstream | API versioning discipline required |
| **Published Language** | Open Host Service uses a shared language (e.g., events schema) | Event-driven integration between contexts | Schema governance needed |

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

### Balanced Coupling — the lens behind these choices

Every choice above (which context-mapping pattern, how big an aggregate, whether to isolate a subdomain) is a coupling decision. The Balanced Coupling model (Vlad Khononov) names three dimensions and one rule that make those decisions explicit instead of a matter of taste.

| Dimension | Question it answers | Levels / factors |
|---|---|---|
| **Integration strength** | How much knowledge do the two sides share? | Contract (weakest) → Model → Functional → Intrusive (strongest) |
| **Distance** | How costly is a coordinated change? | Same method < same class < same module < cross-service < cross-team/cross-system |
| **Volatility** | How likely is either side to change? | Core subdomain = high · Supporting = low · Generic = low functional / variable implementation |

**The balance rule:**
```
MODULARITY = STRENGTH XOR DISTANCE
BALANCE    = (STRENGTH XOR DISTANCE) OR NOT VOLATILITY
```
Coupling is healthy when strength and distance counterbalance each other (strong knowledge sharing kept close, or weak sharing allowed to drift far apart) — or when volatility is low enough that an imbalance never gets exercised. "Loose coupling" and "high cohesion" are both forms of balanced coupling, just at opposite ends of the same rule. Unbalanced coupling is either a **big ball of mud** (low strength, low distance — unrelated things forced together) or a **distributed monolith** (high strength, high distance — tightly bound things forced apart).

**Applying it to the decisions above:**
- **Context-mapping pattern choice** is a strength/distance trade. `Conformist` accepts high strength at high distance — unbalanced unless volatility is low, which is exactly why Rule 1 forbids it for a Core downstream. `ACL` / `OHS+PL` spend translation effort to drop strength to Contract level, rebalancing a high-distance relationship. `Shared Kernel` / `Partnership` keep strength high but compensate with low organisational distance (same team, tight coordination).
- **Subdomain classification** is the volatility axis. Core = high volatility → coupling there must be actively balanced (ACL, never Conformist). Supporting/Generic = low volatility → an unbalanced shortcut is tolerable (Eric Evans: "not all of a large system will be well designed").
- **Aggregate boundaries** (below) are the low-distance/high-strength cell: invariants that must co-change are kept in one consistency boundary precisely because co-location makes that high strength cheap.
- The rule is fractal — it applies identically whether comparing two methods, two aggregates, two bounded contexts, or two systems, always relative to the highest distance available at that level.

Use this lens whenever a context-map label or an aggregate boundary feels arbitrary: name the strength, name the distance, name the volatility, then check the rule before committing the ADR.

### Balanced Coupling — general fractal verdict (applies to EVERY architecture choice)

Every architecture choice is a coupling choice: it creates, removes, moves, or tightens a dependency between two components — two methods, two aggregates, two layers, two bounded contexts, two services. The SAME rule decides all of them; only the level of abstraction changes (the model is fractal). Do not reason it freehand — classify two axes with the concrete cues below, then read the cell.

**Classify STRENGTH (how much knowledge the two sides share):**
- **LOW** = Contract — the dependency crosses an explicit, encapsulated contract (DTO, published event, facade, port/interface, ACL). Neither side sees the other's internals, requirements, or domain model.
- **HIGH** = Model / Functional / Intrusive — the sides share a domain model, share a business rule (must co-change), or reach into each other's implementation.

**Classify DISTANCE (cost of a coordinated change), relative to the level you are at:**
- **LOW** = same method, same class, or same module/aggregate — and, socio-technically, same team, synchronous or in-process.
- **HIGH** = cross-module, cross-service, cross-team, cross-system — or bound only by async messaging.

**Read the cell:**

| | **Low Distance** | **High Distance** |
|---|---|---|
| **Low Strength** | LOW COHESION — unrelated things crammed together (big-ball-of-mud drift) | **BALANCED** (loose coupling) |
| **High Strength** | **BALANCED** (high cohesion) | TIGHT COUPLING — distributed-monolith step |

**Apply the volatility override to the two complexity cells:**
- A cell reading LOW COHESION or TIGHT COUPLING is `UNBALANCED`.
- `UNBALANCED` is **ACCEPTED** — but only if the volatile side is a low-volatility **Supporting/Generic** subdomain AND the ADR cites that as the accepted trade-off (`NOT VOLATILITY` branch).
- Otherwise (a **Core** / high-volatility subdomain, or no citation) it is an `UNBALANCED-SMELL`: rebalance before committing. Rebalance by moving ONE axis: drop strength to a Contract (introduce a port/DTO/ACL/published event), OR reduce distance (co-locate the two sides in one module/aggregate/team).

This is the master rule. The context-map matrix below is simply this table instantiated for the six named inter-context patterns (all of which sit in the High-Distance column).

### Balanced Coupling — precomputed verdict matrix (context-map arrows)

You do NOT need to reason the `STRENGTH XOR DISTANCE` chain by hand. In this pipeline every coupling decision is already an enumerated label: a **context-map pattern** (the arrow) crossed with the **downstream subdomain class** (the volatility). Each pattern has a fixed integration-strength / distance signature, so the balance verdict is a total function over a small finite domain — it is precomputed below. Read the cell; do not re-derive it.

**3-step lookup (no reasoning required):**
1. Read the **arrow label** off the context map (the pattern).
2. Read the **downstream context's subdomain class** (Core, or Supporting/Generic).
3. Read the matching **cell** in the table. That IS the verdict.

| Pattern (arrow label) | Strength | Distance | Core downstream | Supporting / Generic downstream |
|---|---|---|---|---|
| Shared Kernel | High | Low | BALANCED | BALANCED |
| Partnership | High | Low | BALANCED | BALANCED |
| Anti-Corruption Layer | Contract | High | BALANCED | BALANCED |
| Open Host Service / Published Language | Contract | High | BALANCED | BALANCED |
| Separate Ways | None | High | BALANCED | BALANCED |
| Conformist | High | High | **UNBALANCED-SMELL** | **UNBALANCED-ACCEPTED** |

**What each verdict obliges you to do:**
- **BALANCED** — nothing. Strength and distance counterbalance (XOR holds). Commit the label as-is.
- **UNBALANCED-ACCEPTED** — admissible ONLY because the downstream is a low-volatility Supporting/Generic subdomain. You MUST write one sentence in the relevant ADR naming that subdomain as the accepted trade-off (`NOT VOLATILITY` branch of the rule). No citation → treat as a smell.
- **UNBALANCED-SMELL** — both strength and distance are high on a volatile Core subdomain: this is a distributed-monolith step. Do NOT commit it. Rebalance by dropping strength to Contract level (introduce an **ACL**, or have the upstream expose an **OHS + Published Language**). This cell is also forbidden outright by the Context Mapping Selection Rules (Rule 1) and by review gate G17 / G6.

The matrix is closed: these six patterns are the only admissible arrow labels, and Core-vs-(Supporting|Generic) is the only volatility distinction that changes a verdict. Any arrow whose label is not in the left column is itself a defect (unlabelled / ad-hoc coupling).

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

### Common Strategic Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Big Ball of Mud | One context for everything; all models coupled | Split by team ownership or language boundary |
| Anemic Domain | All logic in application services; domain objects are data bags | Move invariants back into aggregates |
| Over-splitting | 15 tiny contexts with no clear purpose | Merge contexts that share a language and team |

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
- Interface defined in Application layer — never in Domain or Infrastructure
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

**Source code dependencies point inward only.**

- Domain → no dependencies
- Application → depends on Domain only
- Infrastructure → depends on Application (implements its interfaces)
- API → depends on Application (invokes use cases)

### Use Case Boundary

The Application layer is the entry point for all external requests. Controllers never touch Domain objects directly — they go through use cases.

### Application Interface

Any I/O abstraction (repository, message publisher, external gateway) is defined as an interface in the Application layer. Infrastructure provides the implementation. This keeps the Application layer testable without real infrastructure.

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

### Aggregate Event Lifecycle

1. Receive command (e.g., `CheckEligibility`)
2. Load aggregate state (replay events from store or from snapshot)
3. Validate command against current state (enforce invariants)
4. Emit domain events (e.g., `EligibilityChecked`)
5. Apply events to update in-memory state
6. Persist events to event store (append-only, with expected version for optimistic concurrency)

### Event Store

- Append-only log — events are never updated or deleted
- Versioned — each event has a monotonically increasing version per aggregate
- Immutable — events are facts; they cannot be changed

### Projections and Read Models

- Built by replaying events — each projector handles a specific set of event types
- Disposable — projections can be dropped and rebuilt from the event log
- Eventually consistent — the read model lags slightly behind the event store
- Purpose-specific — one projection per read concern (avoid generic projections)

### Snapshots

Store the aggregate's current state after every N events to avoid full replay on every load.

- Use when event count per aggregate exceeds ~500 events
- Store snapshot alongside events — load snapshot first, then replay events since snapshot
- Trade-off: storage overhead vs. replay performance

### Sagas / Process Managers

Coordinate cross-aggregate workflows. Sit in the Application layer.

- React to domain events
- Issue commands to other aggregates
- Maintain their own process state (saga state is persisted)
- Are NOT aggregates — they are Application-layer orchestrators

**Example:** `EligibilityRenewalSaga` — listens for `EligibilityExpired` event, issues `RenewEligibility` command to `EligibilityAggregate`, then `NotifyDriver` command to `NotificationAggregate`.

### Upcasting

Handle event schema evolution when the structure of an old event type changes.

- Prefer weak schema: ignore unknown fields when loading old events
- For breaking changes: write an explicit upcaster that transforms old format to current format
- Chain upcasters: V1 → V2 upcaster, V2 → V3 upcaster (never skip versions)

### Conflict Resolution

Optimistic concurrency: when appending to the event store, pass the expected version. If the stored version differs, a conflict has occurred.

| Scenario | Strategy |
|---|---|
| Transient (e.g., two concurrent updates from different UI sessions) | Retry — reload and reapply the command |
| Domain-specific (e.g., two agents claim the same appointment slot) | Merge — apply domain logic to determine the correct outcome |
| Critical (e.g., financial transaction double-spend) | Reject — return a conflict error and require user intervention |

### Eventual Consistency Mitigation

| Technique | Description |
|---|---|
| Read-your-own-writes | After a command, return a token; query endpoint waits for projection to catch up to that version before returning |
| Optimistic UI updates | UI applies the expected state change immediately without waiting for projection |
| Causal consistency tokens | Pass a token that represents "everything up to this point was processed" |

### Outbox Pattern

Solves the dual-write problem: atomically writing to the event store AND publishing to a message broker.

1. Write domain events to the event store
2. Write the same events to an outbox table in the same transaction
3. A background process reads the outbox and publishes to the message broker
4. After successful publish, mark the outbox entry as processed

Avoids the risk of the event store committing but the broker publish failing (or vice versa).

### Reservation Pattern

Handles uniqueness constraints (e.g., unique driver licence number) in event-sourced systems.

- Create a separate `ReservationAggregate` for the unique key
- Command flow: `ReserveLicenceNumber` → `LicenceNumberReserved` (or `LicenceNumberAlreadyReserved`)
- The driver registration aggregate only proceeds after receiving confirmation of reservation

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

| Problem type | Recommended pattern | When NOT to use | Notes |
|---|---|---|---|
| Simple CRUD entity | Clean Architecture + Repository | Don't add Event Sourcing or CQRS | Keep it simple |
| Complex business rules with invariants | DDD Tactical (Aggregate + Specification) | Don't use anemic domain model | |
| Audit trail / regulatory compliance | Event Sourcing | Only if history has real business value | Requires infrastructure investment |
| Multiple diverging read models | CQRS with projections | Not needed for simple queries | Read models are disposable |
| Cross-aggregate coordination | Saga / Process Manager | Don't put saga logic in an aggregate | |
| High read/write ratio | CQRS with read-optimised projections | Don't use for simple apps | |
| Complex domain with multiple teams | DDD Strategic + Context Mapping | Overhead for small teams | |
| Event-driven integration | Domain Events + Outbox Pattern | Don't use for in-process only | |

---

## References

- [event-modeling.md](references/event-modeling.md) — Full Event Modeling methodology and notation guide
- [ddd-strategic.md](references/ddd-strategic.md) — Bounded context identification, context mapping, subdomain classification
- [ddd-tactical.md](references/ddd-tactical.md) — Aggregate, Entity, Value Object, Domain Event, Repository, Specification
- [pattern-catalog.md](references/pattern-catalog.md) — Clean Architecture layers and CQRS pattern details
- [pattern-selection-matrix.md](references/pattern-selection-matrix.md) — Decision table by problem type + composition guide
- [anti-patterns.md](references/anti-patterns.md) — 10 architecture anti-patterns with root causes and fixes
- [event-sourcing.md](references/event-sourcing.md) — Complete Event Sourcing guide: aggregate lifecycle, projections, sagas, upcasting
