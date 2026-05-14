# DDD Tactical Patterns Reference

## Overview

Tactical patterns are the building blocks of the domain model within a bounded context. They implement the Ubiquitous Language in code-agnostic, business-meaningful constructs. Every tactical element is justified by a domain concept, not by a technical need.

**Rule:** Always design tactically inside a bounded context that has been defined strategically. Do not apply tactical patterns without strategic boundaries.

---

## Aggregate

### Definition

A cluster of entities and value objects that form a consistency boundary. All invariants within an aggregate are enforced atomically. An aggregate is identified by the invariants it owns, not by the data it holds.

### Rules

1. **Single root entity** — the Aggregate Root. All external access goes through the root only.
2. **Consistency boundary** — all operations on the aggregate are atomic. If an operation must update two aggregates, they must be eventually consistent.
3. **One Repository per aggregate** — storage is accessed through the root only.
4. **Reference by ID** — never hold a direct object reference to another aggregate root. Reference by identity (e.g., `DriverId`), not by object.
5. **Raise domain events** — the aggregate root raises events after a successful state change.

### Size Guidelines

- **Prefer small aggregates.** Large aggregates cause lock contention and test complexity.
- An aggregate with more than 3–5 child entities is a smell.
- If two entities seem to need the same transaction, ask: "Is there a business invariant that requires this atomicity?" If not, they are separate aggregates.

### When NOT to Create an Aggregate

- Do not create an aggregate to hold a reference list that is only queried, never mutated
- Do not create an aggregate per database table — aggregates model invariants, not data shapes
- Do not create a God aggregate that owns all entities in a context

### Auto-Insurance Example

**`EligibilityAggregate`**
- Root: `Eligibility` (EligibilityId, DriverId, Status, ValidUntil)
- Child Value Objects: `RiskScore`, `DriverHistory`
- Invariant enforced: "A driver may only be eligible if their RiskScore is below 75 and they have fewer than 3 accidents in 5 years."
- Domain event raised: `EligibilityChecked` (on successful check) or `EligibilityDenied` (on rejection)

---

## Entity

### Definition

An object that has a distinct identity that persists over time and across state changes. Two entities with the same attributes but different identities are different objects.

### Identity Types

| Type | Description | Example |
|---|---|---|
| Natural key | An identifier from the business domain | DriverLicenceNumber, PolicyNumber |
| Surrogate key | A system-generated identifier | UUID, ULID |
| Composite key | Multiple attributes together form the identity | (DriverId, PolicyId) for a coverage assignment |

### Lifecycle

Entities have a lifecycle: they are created, modified over time, and eventually deactivated or deleted. The lifecycle is expressed through domain events raised by the owning aggregate.

### Auto-Insurance Example

`Driver` entity inside `PolicyContext`:
- Identity: `DriverId` (UUID)
- State over time: name, licence number, licence expiry date, insured on policies

---

## Value Object

### Definition

An object that has no conceptual identity. Two value objects with the same data are equal. Value objects are immutable — they are never modified after construction.

### Rules

1. **Equality by value** — two `RiskScore(75)` instances are equal even if they are different object instances.
2. **Immutable** — never expose setters; return a new instance when a change is needed.
3. **Self-validating** — construction fails if the value violates its invariants. Never create an invalid value object.
4. **Replace primitives** — prefer `RiskScore` over `int`, `DriverId` over `string`, `Money` over `decimal`.

### When to Use

- Any domain concept that is defined entirely by its attributes
- Any measurement, quantity, or identifier that should carry domain meaning
- When you want to enforce validation at the type level rather than throughout the codebase

### When NOT to Use

- When the object has a meaningful identity that persists over time → use Entity instead
- When the object is a technical DTO with no domain meaning → keep it as a plain object

### Auto-Insurance Examples

| Value Object | Type | Invariants |
|---|---|---|
| `DriverId` | Wraps string | Non-empty, starts with "DRV-" |
| `RiskScore` | Wraps int | Must be 0–100 |
| `DateRange` | Wraps (from: Date, to: Date) | `to` must be after `from` |
| `Money` | Wraps (amount: decimal, currency: string) | Amount non-negative, currency is ISO 4217 |
| `LicenceNumber` | Wraps string | Matches provincial format regex |

---

## Domain Event

### Definition

An immutable record of a fact that has occurred in the domain. Domain events are raised by aggregate roots and represent the outcome of successful command processing.

### Rules

1. **Past tense naming** — `EligibilityChecked`, NOT `EligibilityCheckEvent`, NOT `EligibilityCheckCompleted` (avoid "Completed")
2. **Minimal payload** — include only the fields needed to understand what happened. No denormalised data.
3. **Immutable** — once created, never modified. Events are facts.
4. **Raised by aggregate root** — never raised by application services, use cases, or infrastructure
5. **After state change** — events are raised after the aggregate has successfully applied the state change, not before

### Payload Design

```
EligibilityChecked:
  - eligibilityId: EligibilityId    ← identity of the aggregate
  - driverId: DriverId              ← key domain references (by ID)
  - result: EligibilityResult       ← the fact (Eligible | Ineligible)
  - checkedAt: DateTimeOffset       ← when it happened
  - reason: RejectionReason?        ← nullable — present only when Ineligible
```

**Anti-pattern:** Including computed fields or display labels in the event payload. Projections compute those from the base facts.

### Cross-Aggregate Communication

Domain events enable eventual consistency between aggregates. `EligibilityContext` raises `EligibilityChecked`; `PolicyContext` reacts by creating a policy application.

The reaction is handled by a Saga or an Application-layer event handler — never by a direct call from one aggregate to another.

---

## Repository

### Definition

An abstraction over the storage mechanism for an aggregate. The repository interface is defined in the Application layer; the implementation lives in Infrastructure.

### Rules

1. **One per aggregate** — `IEligibilityRepository`, not `IRepository<Eligibility>`
2. **Interface in Application layer** — the interface knows nothing about databases, ORMs, or SQL
3. **Domain-friendly API** — use business method names: `GetByDriverId`, `FindEligibleDrivers`. Avoid generic query expressions in the interface.
4. **Returns domain objects** — the repository returns aggregate root instances, not DTOs or ORM entities
5. **No ORM leakage in domain** — LINQ expressions, EF navigation properties, and database IDs must not appear in the domain or Application interface

### Interface Example

```
IEligibilityRepository:
  - Save(eligibility: EligibilityAggregate): Task
  - GetById(eligibilityId: EligibilityId): Task<EligibilityAggregate?>
  - GetByDriverId(driverId: DriverId): Task<EligibilityAggregate?>
  - FindExpiredEligibilities(asOf: DateTimeOffset): Task<List<EligibilityAggregate>>
```

### Auto-Insurance Note

The implementation of `IEligibilityRepository` in Infrastructure may use Entity Framework Core, Dapper, or a document store. None of these implementation details appear in the interface or in the domain.

---

## Domain Service

### Definition

A stateless service that encapsulates domain logic that doesn't naturally belong to an aggregate or value object.

### When to Extract to a Domain Service

- The logic involves multiple aggregates and cannot be owned by either
- The logic requires an external domain concept (e.g., a domain calculation that needs data from two aggregates)
- The logic would make an aggregate too large or responsible for too much

### When NOT to Extract

- If the logic belongs to a single aggregate → keep it inside the aggregate
- If the logic is purely infrastructural (database query, HTTP call) → put it in Infrastructure with an Application-layer interface
- If the logic is application orchestration → put it in a Use Case (Application layer)

### Auto-Insurance Example

`EligibilityRiskCalculationService`: calculates the composite risk score from a `DriverHistory` aggregate and external actuarial tables. Neither aggregate fully owns this calculation.

---

## Specification

### Definition

A business rule encapsulated as a predicate. Specifications are composable using `And`, `Or`, `Not` combinators.

### When to Use

- Complex eligibility rules with multiple conditions
- Business rules that need to be composed, tested, and named independently
- When the rule needs to be explained in business terms

### Composition

```
EligibilitySpecification =
  HasCleanRecordSpecification
    .And(HasMinimumExperienceSpecification)
    .And(IsLicenceValidSpecification)
    .And(Not(IsBlacklistedSpecification))
```

Each individual specification has a name that maps directly to the Ubiquitous Language and can be explained to a non-technical stakeholder.

### Auto-Insurance Examples

| Specification | Business rule |
|---|---|
| `HasCleanRecordSpecification` | Fewer than 3 at-fault accidents in the last 5 years |
| `HasMinimumExperienceSpecification` | Licence held for at least 2 years |
| `IsLicenceValidSpecification` | Licence is not expired and not suspended |
| `IsBlacklistedSpecification` | Driver is not on the fraud blacklist |
