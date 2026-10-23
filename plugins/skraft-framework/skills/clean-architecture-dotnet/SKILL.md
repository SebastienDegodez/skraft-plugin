---
name: clean-architecture-dotnet
description: Use when laying out or extending a .NET / ASP.NET Core solution — which project a class belongs in, which project may reference which, and how an endpoint reaches a use case.
---

# Clean Architecture — .NET / ASP.NET Core

The layer rules are those of `architecture-patterns`. This skill maps them onto .NET projects.

## One project per layer

| Project | Holds | Only `<ProjectReference>` to |
|---|---|---|
| `<Context>.Domain` | aggregates, value objects, domain events | nothing |
| `<Context>.Application` | use cases and the interfaces they call | `<Context>.Domain` |
| `<Context>.Infrastructure` | implementations of those interfaces, DI registration (`AddInfrastructure()`) | `<Context>.Application` |
| `<Context>.Api` | endpoints, `Program.cs` | `<Context>.Infrastructure` |

- Inside each project, one folder per feature (`Application/Loans/BorrowBookUseCase.cs`, `Infrastructure/Loans/SqlLoanRepository.cs`), never a technical one (`Persistence`, `Repositories`, `Services`). The `DbContext` and `DependencyInjection.cs` stay at the project root. A feature uses no other feature's Application namespace; what two features use moves to a `Shared` folder.
- Use types reached transitively; never add a `<ProjectReference>` to reach them.
- EF Core, ASP.NET Core and `HttpClient` appear only in Infrastructure and Api. Domain uses nothing beyond the BCL.
- Tests live in the test projects `clean-architecture-testing` defines, never in a layer project.
- `node "<skill>/scripts/init-project.mjs" <Context>`, run from the repository root, creates this layout (`<skill>` is this skill's folder).

## Use cases

- A use case is a `sealed` class in Application named `*UseCase`, never `*Service`. The endpoint injects it directly.
- A command method returns `Task`; the caller creates the new id and passes it in. A query returns a `*ViewModel` record built in Application (never a `*Dto`, never a domain object), or comes from a read-service interface in Application that Infrastructure implements.
- Application declares an interface only where it calls out (repository, read service, gateway, `ICurrentUser`). A repository interface sits in Domain when it persists an aggregate, in Application otherwise.
- Who may *read* a resource is checked in the use case. Who may *change* it is an aggregate rule: the mutation method takes the caller's id and throws.
- A use case orchestrates. Every other `if`/`throw` that protects state belongs in a Domain method.
- No `ICommandBus` / `IQueryBus` unless all three hold: a pipeline every command or query needs (validation, logging), more than three use cases, and read and write models that differ. With a bus, endpoints go through it and never inject a handler.
- A domain event is raised by the aggregate and dispatched by the use case after the save, never from Domain or a repository.

## Domain

- An aggregate is a `sealed` class created through a static factory over a `private` constructor, and identified by a typed id record (`OrderId`), never a raw `Guid`.
- Name an aggregate after the business term (`Order`), never `OrderAggregate`.
- Data with no rule to protect stays a plain record: no aggregate base class, no domain events.

## Guard

The project graph and a framework-free core are enforced by NetArchTest, placed as `clean-architecture-testing` says: read `references/netarchtest-rules.md` when adding or changing an architecture test.

## References

- `references/examples.md`: read before writing a use case, an aggregate or an ownership rule — command and query use case, typed id and factory, read policy vs cancel invariant, event dispatch after the save.
- `references/bus.md`: read only once the three bus conditions hold — handler and bus interfaces, explicit handler registration, endpoints through the bus.
