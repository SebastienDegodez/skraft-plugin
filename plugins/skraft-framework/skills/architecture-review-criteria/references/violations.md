# Violations Detectable in DESIGN Artefacts

Report each under the gate named; when none of your gates covers it, it is not your finding.

| ID | Violation | How it shows in the artefacts | Correct design | Gate |
|---|---|---|---|---|
| V-DDD-01 | Aggregate crosses a context boundary | A use case or aggregate takes another context's aggregate type; an arrow to another context's root | Contexts exchange domain events and IDs; the downstream keeps its own derived state | G5, G6 |
| V-DDD-02 | Domain event raised outside the aggregate | A handler or controller creates and dispatches the event; an event with no aggregate as source; an arrow from a use case or API straight to the bus | The aggregate method emits it; the use case publishes it through an Application interface | G5 |
| V-DDD-03 | Anemic aggregate | Aggregate with only properties or setters (`SetStatus`); invariant logic in handler signatures | Behaviour-revealing methods (`Check`, `Expire`, `Deny`) enforcing invariants | G5 |
| V-DDD-04 | Repository layer diverges from its ADR | Contracts and ADR disagree on Domain vs Application; a CRUD entity's repository under Domain; no ADR records the layer | Domain for an aggregate, Application for a CRUD entity or read model, as the ADR records | G4 |
| V-DDD-05 | Cross-aggregate invariant | A root holds or takes another root; an ADR invariant spans two aggregates without its consistency mechanism | One aggregate owns the invariant, or a saga coordinates both | G5 |
| V-DDD-06 | Missing ACL against a conflicting model | Upstream types (`LegacyContractRecord.RiskClass`) inside downstream aggregates; no translator drawn | Translator at the downstream boundary; upstream types never reach the aggregate | G6 |
| V-DDD-07 | God aggregate | 6+ child entity types, 15+ methods over unrelated concerns, every capability's stories change it | Split by invariant cluster; coordinate with events | G9 |
| V-DDD-08 | Domain service doing an aggregate's job | `EligibilityCheckService.Check(...)` on one aggregate's data | Single-aggregate logic moves into the aggregate | G5 |
| V-DDD-09 | Core downstream labelled Conformist | `Conformist` arrow whose downstream the subdomain table classifies Core; an ADR claiming Conformist while protecting the downstream model | ACL downstream, ideally over an upstream OHS/PL | G6 |
| V-DDD-10 | Conformist mislabel | `Conformist` while the consumed type is a public view or integration event, copied or mapped into local types | OHS + Published Language upstream, ACL downstream | G6 |
| V-CA-01 | Inner layer depends outward | Domain or Application signature with an Infrastructure, ORM or web type (`DbContext`, `IMongoCollection<T>`, `HttpContext`, `IFormFile`); a handler depending on a concrete repository | Inner layers name only their own and inner types; implementations injected at the composition root | G3 |
| V-CA-02 | Interface defined in Infrastructure | `IEligibilityRepository` listed under Infrastructure; Application importing from Infrastructure to reach it | Interface in Domain or Application; Infrastructure implements it | G4 |
| V-CA-03 | Use case bypasses the aggregate | Handler saves a hand-built object without calling an aggregate method; Application contracts repeat domain invariants | Load aggregate → aggregate method → persist → publish events | G5 |
| V-CA-04 | ORM leaking into an interface | `FindAll(Expression<Func<…>>)`, `IQueryable<T>`, `EntityEntry<T>` in a Domain or Application interface | Named methods over domain types (`GetByDriverId`, `FindEligibleDrivers(asOf)`) | G3 |
| V-CA-05 | Use cases sharing mutable state | A stateful shared service or cache injected into several handlers, no concurrency addressed | Stateless use cases; shared state in an aggregate or a read model | G9 |
