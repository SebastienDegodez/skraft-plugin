---
name: architecture-patterns
description: Use when selecting architecture patterns for a new feature, performing Event Modeling, defining bounded contexts, choosing DDD tactical patterns, evaluating pattern fitness, or understanding how patterns compose. Covers Event Modeling methodology, DDD strategic design, DDD tactical patterns, Clean Architecture, CQRS, and Event Sourcing.
---

# Architecture Patterns

Select a pattern for a problem, never by preference. Every pattern added to a design is justified
by a story or a quality-attribute requirement; "we might need it later" justifies nothing.

Patterns compose in this order, outside in: Event Modeling (what the system does) → DDD Strategic
(where the boundaries are) → DDD Tactical (the domain model) → Clean Architecture (layers) → CQRS
(commands vs queries) → Event Sourcing (only when history has value) → Sagas (cross-aggregate
workflows). CQRS and Event Sourcing are independent: CQRS without Event Sourcing is the common case.

## Event Modeling

Model behaviour as a timeline: **Command** (imperative intent, may be rejected) → **Event**
(past-tense fact, never rejected) → **Read Model** (query output shaped for one consumer, no
mutation). One command + its events + the read model that surfaces the result is a **slice**, the
minimum unit of deliverable value; each slice maps to Gherkin (Given = prior state, When =
command, Then = event and/or read model).

- Name events as business facts, never implementation steps (`SaveToDatabase`).
- Every command can be rejected: model its rejection event.
- Every command has a read model the user needed before acting.
- Model only the slices the current stories require.

Procedure, slice completeness check and examples: [references/event-modeling.md](references/event-modeling.md).

## DDD Strategic Design

- **Bounded context:** a boundary inside which every term has one meaning. Same word, different
  meaning → different contexts; also consider a boundary on different team, rate of change or
  data store. Name contexts after their language (`EligibilityContext`), never a layer.
- **Subdomain class:** Core (competitive advantage: full DDD), Supporting (necessary, not
  differentiating: standard patterns), Generic (commodity: buy or use off the shelf).
- **Ubiquitous Language:** per context; code, tests and docs use it untranslated; a concept from
  another context is translated at the boundary.

Apply these before labelling any context-map arrow:

1. **A Core downstream is never Conformist.** It gets an Anti-Corruption Layer (ideally against
   an upstream Open Host Service / Published Language). Conformist is admissible only for a
   Supporting or Generic downstream.
2. **Consuming a published contract is not Conformist.** Upstream exposing a stable public
   contract (ViewModel, event schema, DTO) and hiding its entities is Open Host Service +
   Published Language.
3. **A local copy or translation is an ACL**, however trivial the translation is today.

| Observation | Label |
|---|---|
| Downstream imports upstream domain entities, no translation | Conformist (Supporting/Generic downstream only) |
| Upstream exposes a stable public contract, hides its domain | Open Host Service + Published Language |
| Downstream translates or copies that contract into its own types | Anti-Corruption Layer |
| Downstream is Core | ACL, whatever the translation effort |

All seven context-map patterns with their risks: [references/ddd-strategic.md](references/ddd-strategic.md).

## DDD Tactical Patterns

- **Aggregate:** one root, all access through it; invariants enforced atomically inside, never
  across aggregates; reference other aggregates by ID only; one repository per aggregate; prefer
  small (more than 3–5 child entities is a smell). Two entities share an aggregate only when a
  business invariant needs them in one transaction.
- **Value object:** immutable, equal by value, self-validating; replaces primitives.
- **Domain event:** past tense (`EligibilityChecked`, not `EligibilityCheckEvent`), minimal
  immutable payload, raised by the aggregate root after the state change.
- **Repository:** one per aggregate, domain-named methods, returns aggregates, no ORM type in the
  interface. Interface in **Domain** when it persists an aggregate, in **Application** for a CRUD
  entity or a read model, never in Infrastructure; the aggregate's ADR records the choice.
- **Domain service:** stateless logic spanning several aggregates; logic of one aggregate stays in
  it; infrastructural logic goes behind an Application interface.
- **Policy / Specification:** a named rule; a Specification is a composable predicate
  (`HasCleanRecord.And(HasMinimumExperience)`).

Rules per pattern, when not to use each, examples: [references/ddd-tactical.md](references/ddd-tactical.md).

## Clean Architecture

Layers: API (controllers, request/response models) → Infrastructure (persistence, messaging,
external APIs; implements Application interfaces) → Application (use cases, commands, queries,
Application interfaces) → Domain (aggregates, entities, value objects, events, domain services).

### Dependency Rule

Project references point inward only, one layer at a time:

- Domain → nothing
- Application → Domain
- Infrastructure → Application
- API → Infrastructure (composes use cases through it)

Types reachable through a transitive reference may be imported; never add a direct reference to
reach them.

### Feature Folders

Inside each layer, group code by feature (`Loans`, `Invoicing`), never by technical kind
(`Repositories`, `Services`). A feature's use cases import no other feature's application code;
what two features both need moves to that layer's `Shared` folder.

### Use Case Boundary

Every external request goes through a use case; a controller never touches a Domain object or a
repository. Any I/O abstraction (publisher, gateway, read store) is an Application interface,
implemented in Infrastructure, injected, and exposes no framework type (`DbContext`,
`IQueryable`).

## CQRS

Apply when read and write shapes diverge, reads dominate, or reporting needs projections; never
for CRUD with the same shapes, never "because CQRS". Commands mutate through aggregates and return
an acknowledgment or an id, never a view; queries never mutate and return a model shaped for the
consumer, never an aggregate. Default to simple CQRS (one database); separate stores only with
Event Sourcing or a measured read problem.

Read [references/cqrs.md](references/cqrs.md) when choosing between the repository and a read
store for a query, deciding who maps an aggregate to a ViewModel, or choosing a command bus or a
projection type.

## Event Sourcing

Ask: **does knowing the history of state changes provide business value?** No → do not use it.
Yes when: audit trail required, temporal queries, several diverging read models, events are the
integration API. Never for a Generic or Supporting subdomain, nor for CRUD without audit need.

Read [references/event-sourcing.md](references/event-sourcing.md) once Event Sourcing is chosen:
lifecycle, store, projections, snapshots, sagas, upcasting, concurrency, outbox, reservation.

## Selecting a pattern

[references/pattern-selection-matrix.md](references/pattern-selection-matrix.md): problem →
pattern table, pattern depth per subdomain class, combinations to avoid. Read it before adding any
pattern beyond Clean Architecture + Repository.

[references/anti-patterns.md](references/anti-patterns.md): read when reviewing an existing design
for misplaced logic, leaking abstractions or over-engineering.
