# Pattern Selection Matrix

| Problem | Pattern | Do not | Notes |
|---|---|---|---|
| Simple CRUD, no complex rule | Clean Architecture + Repository | Add CQRS, Event Sourcing or aggregates without invariants | The use case maps the entity to the ViewModel |
| Complex rules with invariants | Aggregate + Policy / Specification | Use an anemic model or put invariants in use cases | Find the consistency boundary first |
| Audit trail or temporal queries | Event Sourcing | Apply to Supporting or Generic subdomains | Pair with an event store |
| Several diverging read models | CQRS with projections | Use when read and write shapes match | Projections are disposable |
| Cross-aggregate workflow | Saga in Application | Put saga logic in an aggregate; use distributed transactions | Sagas issue commands, hold no invariant |
| High read/write ratio, different query shapes | CQRS, read-optimised projections | Use for modest read load | Simple CQRS first; separate stores only when reads require it |
| Several teams, distinct languages | Strategic design + context map | Impose on a small team or simple domain | Boundaries where the language changes |
| Integration between contexts by events | Domain events + Outbox | Publish externally without the outbox | Consumers idempotent |
| Uniqueness under Event Sourcing | Reservation aggregate | Use in a state-based store | Unique index there |
| Aggregates need the same information at different times | Eventual consistency via events + projections | Use distributed transactions | Causal tokens for read-your-own-writes |

## Depth per subdomain

| Subdomain | Depth |
|---|---|
| Core | Full DDD; CQRS and Event Sourcing when their signals hold |
| Supporting | Clean Architecture + Repository; simple CQRS if needed |
| Generic | Thin wrapper over an off-the-shelf solution |

## Combinations to avoid

| A | B | Why |
|---|---|---|
| Event Sourcing | Generic subdomain | Commodity gains nothing from history |
| Saga | Aggregate (merged) | Coordination and invariants have different lifecycles |
| Full CQRS (separate stores) | Simple CRUD | Operational cost unjustified |
| Shared Kernel | Fast-changing Core concept | Every change needs both teams |

Each step of "CQRS → Event Sourcing → Saga → separate event store" needs its own concrete story or
quality attribute; refuse the step otherwise.
