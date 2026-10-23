# CQRS: repository, read store, projections

## Repository or read store

| | `IXxxRepository` | `IXxxReadStore` |
|---|---|---|
| Returns | The aggregate (invariants enforced) | A ViewModel / summary shaped for the consumer |
| Used by | Command use cases | Query use cases |
| Implementation | Hydrates the aggregate | Projects the needed columns straight to the DTO |
| Interface layer | Domain (aggregate) or Application (CRUD entity) | Application |

| Signal | Introduce `IXxxReadStore`? |
|---|---|
| The use case reads only to display (no mutation follows) | Yes: do not hydrate the aggregate |
| Read shape differs from the aggregate (joins, counts, extra columns) | Yes |
| Read performance is a measured problem | Yes: dedicated projection or cache |
| Simple CRUD, read and write shapes nearly identical | No: the use case maps the aggregate |

Do not introduce a read store because it feels cleaner; introduce it when the repository causes a
concrete problem (hydration cost, ORM leakage, unreadable mapping).

## Who maps to the ViewModel

- Without a read store: the **use case** maps the aggregate to the ViewModel.
- With a read store: the read store implementation maps; the use case passes through.
- The domain entity never references a ViewModel (no `Dossier.ToViewModel()`).
- A repository never returns a ViewModel.

```csharp
public interface IDossierRepository { Task<Dossier?> GetById(Guid id, CancellationToken ct); Task Save(Dossier d, CancellationToken ct); }
public interface IDossierReadStore { Task<DossierViewModel?> GetById(Guid id, CancellationToken ct); Task<IReadOnlyList<DossierSummary>> List(CancellationToken ct); }
```

In-memory implementations of both share the same backing dictionary; the separation is at the
interface, not the storage.

## Command bus

Not required by CQRS. Call the handler directly (through DI) by default; use a bus only when a
cross-cutting concern (logging, validation) must apply to every command, or several handlers react
to one command.

## Projection types

| Type | When |
|---|---|
| Database view | Read model is a subset or join of the write tables |
| Projection table updated by an event handler | Needs denormalisation or aggregation absent from the write schema |
| In-memory projection from replayed events | Event Sourcing with full CQRS |
| Read replica | High read load, same shape |

## Mistakes

| Symptom | Fix |
|---|---|
| Query handler returns the aggregate or ORM entity | Return a flat DTO from a projection or read store |
| `FindAll(x => x.Status == "Open")` in a repository interface | Named method; the expression lives in Infrastructure |
| Read store with no measured problem on simple CRUD | Remove it; map in the use case |
