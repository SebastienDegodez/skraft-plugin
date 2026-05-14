# Clean Architecture Violation Catalog

## Overview

Violations of Clean Architecture principles detectable in DESIGN artefacts — interface contracts, component diagrams, ADRs, and event models. Each entry explains how to detect the violation in artefacts (not in running code) and what the correct design looks like.

---

## V-CA-01: Domain Importing from Infrastructure

**ID:** V-CA-01
**Severity:** BLOCKER

**Description:** The Domain layer has a dependency on the Infrastructure layer. This violates the fundamental dependency rule of Clean Architecture: source code dependencies must point inward only.

**How to detect in artefacts:**
- Contracts list a Domain type that has a method parameter or return type from Infrastructure (e.g., `DbContext`, `SqlConnection`, `IMongoCollection<T>`)
- Diagram shows an arrow from the Domain layer to the Infrastructure layer
- An ADR proposes placing a persistence interface in the Domain layer

**Severity:** BLOCKER — the Domain layer must be pure business logic with no external dependencies. Any Infrastructure dependency makes the Domain untestable in isolation and defeats the purpose of Clean Architecture.

**Correct approach:** Domain layer has no external dependencies. Any data access need is expressed as a domain method that receives its data via parameters (fetched by the Application layer beforehand). No persistence interfaces in Domain.

---

## V-CA-02: Application Importing from Infrastructure

**ID:** V-CA-02
**Severity:** BLOCKER

**Description:** The Application layer directly uses Infrastructure types rather than depending on Application-layer interfaces.

**How to detect in artefacts:**
- Contracts show a command or query handler with a constructor parameter or field of an Infrastructure type (e.g., `EligibilityDbContext`, `EligibilityRepository` — the concrete class, not the interface)
- Diagram shows a direct dependency arrow from Application use cases to Infrastructure implementations

**Severity:** BLOCKER — the Application layer must depend only on abstractions (interfaces it defines). Depending on Infrastructure concrete types prevents substitution for testing and alternative implementations.

**Correct approach:** Command and query handlers depend on Application-layer interfaces (`IEligibilityRepository`, `IEventPublisher`). The Infrastructure implementations are injected via DI at the composition root — never imported directly by the Application layer.

---

## V-CA-03: Repository Interface Defined in Infrastructure

**ID:** V-CA-03
**Severity:** BLOCKER

**Description:** A repository or gateway interface is defined in the Infrastructure layer rather than in the Application layer.

**How to detect in artefacts:**
- Contracts explicitly list `IEligibilityRepository` under the Infrastructure layer section
- Diagram shows the repository interface inside the Infrastructure boundary, with the Application layer importing from Infrastructure
- No repository interfaces appear in the Application layer contracts

**Severity:** BLOCKER — if the interface is in Infrastructure, the Application layer must import from Infrastructure to use it, violating the dependency rule (V-CA-02). The interface must be defined in the layer that depends on it — the Application layer.

**Correct approach:** Define `IEligibilityRepository` in the Application layer. The Infrastructure project references Application to implement the interface. Application never references Infrastructure.

---

## V-CA-04: Domain Event Raised from API Layer

**ID:** V-CA-04
**Severity:** HIGH

**Description:** A domain event is raised directly from a Controller or API endpoint, bypassing the Application and Domain layers entirely.

**How to detect in artefacts:**
- Contracts show an API controller method that creates and dispatches a domain event
- Event model shows an event with no corresponding aggregate as the source — the source is listed as "Controller" or "API endpoint"
- Diagram shows an arrow from the API layer directly to the event bus, skipping the Domain aggregate

**Severity:** HIGH — domain events represent facts asserted by the domain model. An API layer has no business asserting domain facts directly. This pattern allows the domain's invariants to be bypassed.

**Correct approach:** API layer → invokes Application use case (Command Handler) → Command Handler invokes Domain aggregate method → Aggregate emits domain event → Application layer publishes via `IEventPublisher` interface.

---

## V-CA-05: Use Case Bypassing Domain Logic

**ID:** V-CA-05
**Severity:** HIGH

**Description:** A command handler or use case directly calls a repository to mutate state, bypassing the domain aggregate. Business logic that should live in the aggregate is embedded in the use case.

**How to detect in artefacts:**
- Contracts show a command handler that calls `IEligibilityRepository.Save()` with a manually constructed eligibility object, without any aggregate method being called
- The aggregate in the diagram has no behaviour methods — all business logic is in the command handler signature
- Application layer contracts duplicate invariant rules that should be in the domain

**Severity:** HIGH — the domain aggregate's role is to enforce invariants. If the use case bypasses the aggregate, invariants can be violated by any use case that doesn't duplicate all the checks.

**Correct approach:** Command handler loads aggregate → invokes aggregate method → aggregate enforces invariants and emits events → command handler calls repository to persist → command handler publishes events.

---

## V-CA-06: Infrastructure Details Leaking into Application Contracts

**ID:** V-CA-06
**Severity:** HIGH

**Description:** Application layer interface contracts expose infrastructure-specific types or concepts — ORM types, SQL constructs, or framework-specific expressions.

**How to detect in artefacts:**
- Contracts list `IEligibilityRepository` with a method signature like `FindAll(Expression<Func<Eligibility, bool>> predicate)` — an ORM-specific type
- Contracts include `IQueryable<T>` as a return type from any Application interface
- Contracts reference `EntityEntry<T>`, `ChangeTracker`, or other ORM framework types in Application layer interfaces

**Severity:** HIGH — ORM types in Application layer interfaces bind the Application layer to a specific persistence technology. Switching persistence requires changing Application layer code, which should never be necessary.

**Correct approach:** Application layer interfaces use domain types only. Named, specific methods: `FindEligibleDrivers(asOf: DateTimeOffset)`, `GetByDriverId(driverId: DriverId)`. No generic query expressions.

---

## V-CA-07: Multiple Use Cases Sharing Mutable State

**ID:** V-CA-07
**Severity:** MEDIUM

**Description:** Two or more command handlers or use cases share mutable state — a static field, a singleton with mutable data, or a shared in-memory collection — creating hidden coupling between use cases.

**How to detect in artefacts:**
- Contracts describe a shared service with mutable state that is injected into multiple command handlers
- Diagram shows multiple use cases pointing to the same stateful component that is not a domain aggregate
- An ADR proposes a shared cache or shared registry without addressing concurrency

**Severity:** MEDIUM — shared mutable state between use cases creates race conditions, test isolation failures, and hidden side effects. Use cases should be independently executable.

**Correct approach:** Use cases are stateless. Any shared state is managed by a domain aggregate (with proper concurrency control) or a read model (which is immutable from the use case perspective).

---

## V-CA-08: Application Layer Importing Framework-Specific Types

**ID:** V-CA-08
**Severity:** HIGH

**Description:** The Application layer imports framework-specific types from ASP.NET Core, Entity Framework, MediatR, or other infrastructure frameworks directly in use case logic.

**How to detect in artefacts:**
- Contracts show command handlers with parameters of type `HttpContext`, `IFormFile`, `CancellationToken` from ASP.NET, or `IRequest<T>` from MediatR used in the domain logic (not just the handler signature)
- Application layer ADRs specify hard dependencies on a specific framework version
- Diagram shows the Application layer directly coupled to a web framework component

**Severity:** HIGH — framework-specific types in Application layer logic make the use cases untestable without the framework running. It couples business logic to infrastructure choices.

**Correct approach:** Application layer use cases use plain types. `CancellationToken` is acceptable at handler method signatures; framework types must not appear in the use case body or in domain method calls. Use DTOs for command/query payloads — never `HttpContext` or request framework types.
