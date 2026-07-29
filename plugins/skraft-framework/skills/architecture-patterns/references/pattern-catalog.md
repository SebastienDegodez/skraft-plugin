# Clean Architecture & CQRS Pattern Catalog

## Overview

This catalog covers the two structural patterns that govern how bounded contexts are internally organised: Clean Architecture (layer structure and dependency rules) and CQRS (separation of command and query concerns). These patterns are applied inside a bounded context after DDD Strategic Design has defined the boundaries.

---

## Clean Architecture

### Intent

Organise code into concentric layers where inner layers have no knowledge of outer layers. The business logic is independent of frameworks, databases, and delivery mechanisms.

### Layer Structure

```
┌─────────────────────────────────────────────────────┐
│  API / Presentation                                  │
│  (Controllers, Minimal API endpoints, DTOs,          │
│   ViewModels, Request/Response models)               │
├─────────────────────────────────────────────────────┤
│  Application                                         │
│  (Use Cases: Command Handlers, Query Handlers)       │
│  (Application Interfaces: I*Repository, I*Publisher, │
│   I*Gateway)                                         │
│  (Commands, Queries, DTOs)                           │
├─────────────────────────────────────────────────────┤
│  Domain                                              │
│  (Aggregates, Entities, Value Objects)               │
│  (Domain Events, Domain Services, Specifications)    │
│  (No external dependencies)                          │
├─────────────────────────────────────────────────────┤
│  Infrastructure                                      │
│  (Persistence: EF Core, Dapper, DocumentDB)          │
│  (Messaging: RabbitMQ, Azure Service Bus)            │
│  (External APIs: HTTP clients, adapters)             │
│  (Implements Application layer interfaces)           │
└─────────────────────────────────────────────────────┘
```

### Dependency Rule

**Source code dependencies point inward only.**

| Layer | May depend on | Must NOT depend on |
|---|---|---|
| Domain | Nothing | Application, Infrastructure, API |
| Application | Domain | Infrastructure, API |
| Infrastructure | Application, Domain | API |
| API | Application | Domain directly, Infrastructure |

**The dependency rule is non-negotiable.** Any violation is a BLOCKER in the architecture review.

### Use Case Boundary

The Application layer is the single entry point for all external requests. The boundary is enforced by the use case interfaces:

```
API Controller
  → (invokes) Application Command/Query Handler
    → (uses domain) Domain Aggregate
    → (via interface) Application Interface (e.g., IEligibilityRepository)
      ← (implemented by) Infrastructure Repository
```

The controller knows the command/query shape. It does NOT know the domain aggregate.

### Application Interface Rules

- **Defined in Application layer** — the interface lives in the Application project
- **Implemented in Infrastructure** — the concrete class lives in the Infrastructure project
- **Injected via DI** — the Application layer receives the implementation through dependency injection; it never instantiates it
- **No infrastructure types** — the interface must not expose `DbContext`, `IQueryable`, `SqlConnection`, or any framework-specific type

### Anti-Pattern: Skipping the Use Case Boundary

```
// Wrong: Controller calls repository directly
public class EligibilityController
{
    private readonly IEligibilityRepository _repo; // ← bypasses Application layer
    
    public async Task<IActionResult> Get(string driverId)
    {
        var eligibility = await _repo.GetByDriverId(new DriverId(driverId));
        return Ok(eligibility);
    }
}
```

The controller must go through a Query Handler. The repository is an infrastructure detail.

---

## CQRS

### Intent

Separate the model used to handle state mutations (commands) from the model used to handle reads (queries). Each side can be optimised independently.

### Structure

```
┌──────────────────────────────────────────────────────┐
│  Command Side                   Query Side            │
│                                                       │
│  Controller                     Controller            │
│    ↓ Command                      ↓ Query             │
│  CommandHandler                 QueryHandler          │
│    ↓ Domain operations            ↓ Read projection   │
│  DomainAggregate                ReadModel             │
│    ↓ persist                      ↓ return            │
│  WriteRepository                ReadRepository        │
│  (append-only or state)         (optimised view)      │
└──────────────────────────────────────────────────────┘
```

### Command Side Rules

- Mutates state via domain aggregates
- Raises domain events
- Returns minimal data: an acknowledgment, a created ID, or nothing
- NEVER returns a read-optimised view — that is the query side's responsibility

### Query Side Rules

- Reads state from a read model or projection
- NEVER mutates state
- Returns data shaped for the specific consumer
- May read from the same database as the write side (simple CQRS) or from a separate read store (full CQRS)

### When to Apply CQRS

| Signal | Apply CQRS? | Notes |
|---|---|---|
| Command and query models have diverging shapes | Yes | Classic case |
| High read load, modest write load | Yes | Query side can be scaled independently |
| Complex reporting with many aggregations | Yes | Read models are purpose-built |
| Simple feature with same read/write shape | No | Over-engineering |
| Requirement to "use CQRS" without a problem | No | Justify with a real problem |

### Simple CQRS (Same Database)

Both command and query handlers use the same database. The command handler writes via the domain model; the query handler reads from a read view or projection table. No separate store.

**When:** Most cases. Default choice unless there is a strong case for full CQRS.

### Full CQRS (Separate Stores)

Command side writes to an event store. Query side reads from one or more purpose-built read databases (e.g., ElasticSearch for search, Redis for caching, SQL for reporting).

**When:** Combined with Event Sourcing. High read/write ratio with very different query patterns. Only when the operational complexity is justified.

### Command Bus vs Direct Call

| Approach | Description | When |
|---|---|---|
| Direct call | Controller instantiates and calls the Command Handler directly (or via DI) | Simple CQRS, single application |
| Command bus (MediatR pattern) | Controller sends a command to a bus; the bus routes to the handler | When cross-cutting concerns (logging, validation) must be applied uniformly to all commands |

**Note:** The command bus is not required by CQRS. It is a routing mechanism. Choose it when it solves a real problem (cross-cutting concerns, multiple handlers per command), not by default.

### Query Projection Patterns

| Pattern | Description | When |
|---|---|---|
| Database view | A SQL view built from the write tables | Simple read model that is a subset/join of write-side data |
| Projection table | A separate table updated by an event handler | When the read model requires denormalisation or aggregation not available in the write schema |
| In-memory projection | Build read models in memory from replayed events | Event Sourcing systems with full CQRS |
| Read replica | Copy of the write database with read-optimised indexes | High read load with no structural divergence between read and write models |

### Auto-Insurance Example

**Command side:** `CheckEligibilityCommand` → `CheckEligibilityCommandHandler` → `EligibilityAggregate.Check()` → raises `EligibilityChecked` → persisted via `IEligibilityRepository`

**Query side:** `GetEligibilityQuery` → `GetEligibilityQueryHandler` → reads from `eligibility_read_model` projection table → returns `EligibilityResultDto`

The command handler and query handler share no code. The read model is a flat table with all display fields pre-computed. The domain aggregate is never returned from a query.
