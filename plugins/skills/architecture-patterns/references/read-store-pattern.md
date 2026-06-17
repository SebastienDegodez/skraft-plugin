# Repository vs ReadStore: light CQS separation

## The problem

A Repository reconstitutes an aggregate. When a use case calls
`IXxxRepository.GetById` only to map the result to a ViewModel and return it,
the aggregate is hydrated for nothing: its invariants, its child collections,
and its value objects are loaded and immediately discarded.

This is a symptom of using the write-side interface for a read concern.

---

## Two contracts, two responsibilities

| | `IXxxRepository` | `IXxxReadStore` |
|---|---|---|
| Returns | `XxxAggregate` (mutable, invariants enforced) | `XxxViewModel` / `XxxSummary` (immutable, shaped for the consumer) |
| Used by | Command use cases (Create, Update, Delete) | Query use cases (GetById, List, Search) |
| Infrastructure impl | Hydrates aggregate from all mapped columns | Projects a SELECT directly to a DTO |
| In-memory impl | `Dictionary<Guid, XxxAggregate>` | Reads the same `Dictionary`, maps on the fly |
| Interface layer | Application (or Domain if DDD-purist) | Application |

The Repository is the write model's access point.
The ReadStore is the read model's access point.
Neither crosses into the other's territory.

---

## Decision: when to introduce `IXxxReadStore`

Apply the criteria from the pattern-selection-matrix before introducing a separate read interface.

| Signal | Separate `IXxxReadStore`? |
|---|---|
| Use case reads data **only to display it** (no mutation follows) | Yes — avoid loading the aggregate |
| Read shape differs from the aggregate shape (extra columns, joins, counts) | Yes — the repository cannot serve this without leaking ORM |
| CRUD simple — read and write shapes are nearly identical | No — the use case maps the aggregate; overhead is minimal |
| High read/write ratio, read performance is a measured problem | Yes — the ReadStore can use a dedicated projection or cache |
| Team is not yet familiar with the pattern | No — add it when the pain is real, not speculatively |

**YAGNI applies.** Do not introduce `IXxxReadStore` because it feels cleaner.
Introduce it when the repository is causing a concrete problem (hydration overhead,
ORM leakage in queries, unreadable mapping code in the use case).

---

## Who maps the aggregate to a ViewModel?

**For CRUD simple (no `IXxxReadStore` yet):**

The use case maps the aggregate to the ViewModel. This is the correct and expected location.

```csharp
// Application layer — query use case
public sealed class GetDossierByIdUseCase
{
    private readonly IDossierRepository _repository;

    public async Task<DossierViewModel?> Handle(Guid id, CancellationToken ct)
    {
        var dossier = await _repository.GetById(id, ct);
        return dossier is null ? null : ToViewModel(dossier);   // mapping here
    }

    private static DossierViewModel ToViewModel(Dossier d) =>
        new(d.Id, d.Reference, d.Statut.ToString(), d.Pieces.Count);
}
```

The domain entity (`Dossier`) must NOT reference `DossierViewModel`.
The ViewModel is a presentation/application concern; the domain must stay ignorant of it.

**When `IXxxReadStore` is introduced:**

The ReadStore returns the ViewModel directly. The use case becomes a thin pass-through.

```csharp
// Application layer — query use case, now thin
public sealed class GetDossierByIdUseCase
{
    private readonly IDossierReadStore _readStore;

    public Task<DossierViewModel?> Handle(Guid id, CancellationToken ct) =>
        _readStore.GetById(id, ct);   // mapping is inside the ReadStore impl
}
```

---

## Interface contracts

```csharp
// Write side — Application layer
public interface IDossierRepository
{
    Task<Dossier?> GetById(Guid id, CancellationToken ct);
    Task Save(Dossier dossier, CancellationToken ct);
}

// Read side — Application layer
public interface IDossierReadStore
{
    Task<DossierViewModel?> GetById(Guid id, CancellationToken ct);
    Task<IReadOnlyList<DossierSummary>> List(CancellationToken ct);
}
```

---

## In-memory implementations (tests and dev)

Both share the **same** backing store. The separation is at the interface level,
not the storage level.

```csharp
public sealed class InMemoryDossierRepository : IDossierRepository
{
    private readonly Dictionary<Guid, Dossier> _store;

    public InMemoryDossierRepository(Dictionary<Guid, Dossier> store) =>
        _store = store;

    public Task<Dossier?> GetById(Guid id, CancellationToken ct) =>
        Task.FromResult(_store.GetValueOrDefault(id));

    public Task Save(Dossier dossier, CancellationToken ct)
    {
        _store[dossier.Id] = dossier;
        return Task.CompletedTask;
    }
}

public sealed class InMemoryDossierReadStore : IDossierReadStore
{
    private readonly Dictionary<Guid, Dossier> _store;   // same backing store

    public InMemoryDossierReadStore(Dictionary<Guid, Dossier> store) =>
        _store = store;

    public Task<DossierViewModel?> GetById(Guid id, CancellationToken ct)
    {
        var d = _store.GetValueOrDefault(id);
        return Task.FromResult(d is null ? null : ToViewModel(d));
    }

    public Task<IReadOnlyList<DossierSummary>> List(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<DossierSummary>>(
            _store.Values.Select(d => new DossierSummary(d.Id, d.Reference)).ToList());

    private static DossierViewModel ToViewModel(Dossier d) =>
        new(d.Id, d.Reference, d.Statut.ToString(), d.Pieces.Count);
}
```

In production, `InMemoryDossierReadStore` is replaced by an implementation
that queries the database directly (EF `AsNoTracking().Select(...)` or raw SQL
via Dapper), projecting only the columns needed for the ViewModel.

---

## Anti-patterns

| Anti-pattern | Symptom | Fix |
|---|---|---|
| Repository returns ViewModel | `IDossierRepository.GetById` returns `DossierViewModel` | Repository contract must return the aggregate; introduce `IDossierReadStore` for read shapes |
| Domain entity references ViewModel | `Dossier.ToViewModel()` method on the aggregate | Move the mapping to the use case or the ReadStore implementation |
| ReadStore introduced speculatively | No measured hydration overhead; CRUD simple | Remove — the use case mapping is sufficient |
| ORM expressions in the repository interface | `FindAll(x => x.Statut == "Ouvert")` in `IXxxRepository` | Use domain-friendly method names; push ORM expressions into the Infrastructure implementation |
