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
- `scripts/init-project.sh` (or `.ps1`) creates this layout.

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
- Data with no rule to protect stays a plain record: no aggregate base class, no domain events.

## Guard

The project graph and a framework-free core are enforced by NetArchTest: `templates/IntegrationTests/ArchitectureTests.cs` and `references/netarchtest-rules.md`, placed as `clean-architecture-testing` says.

## References

- `references/patterns.md`: code for a plain use case, CQRS with DDD and domain events, plus the red flags and common mistakes.
- `references/interface-placement.md`: repository, read-service, authorization and `ICurrentUser` placement, with read-policy and cancel-invariant examples.
- `references/ddd.md`: aggregates, factories, value objects, domain events.
- `references/cqrs-patterns.md` and `references/convention-based-di.md`: the bus, handlers and DI registration, once a bus is justified.
- `references/layer-responsibilities.md`, `references/architecture-layers.md`, `references/project-structure.md`: full rules per layer and the folder layout.
