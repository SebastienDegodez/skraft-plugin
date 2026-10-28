# Command and query bus

Read only once SKILL.md's three conditions for a bus all hold. A new solution gets the files
below from `init-project.mjs <Context> --bus`.

```csharp
// Application/Shared
public interface ICommandHandler<in TCommand> { Task HandleAsync(TCommand command, CancellationToken ct = default); }
public interface IQueryHandler<in TQuery, TResult> { Task<TResult> HandleAsync(TQuery query, CancellationToken ct = default); }
public interface ICommandBus { Task PublishAsync<TCommand>(TCommand command, CancellationToken ct = default); }
public interface IQueryBus { Task<TResult> SendAsync<TQuery, TResult>(TQuery query, CancellationToken ct = default); }
```

- Commands and queries are `sealed record`s; handlers are `sealed` classes in their feature
  folder; a command handler returns `Task` and the command carries the new id.
- `CommandBus` / `QueryBus` live in Infrastructure and resolve the handler from the
  `IServiceProvider`.
- Register each handler explicitly in `AddInfrastructure()` with `services.AddHandler<THandler>()`
  (scoped, AOT-safe) when you create it; never `Assembly.GetTypes()` scanning, never a
  hand-written `AddScoped<ICommandHandler<...>>`. `templates/Infrastructure/DependencyInjection.Bus.cs`
  holds `AddHandler`.
- Endpoints inject `ICommandBus` / `IQueryBus`, never a handler:

```csharp
app.MapPost("/orders", async (PlaceOrderRequest req, ICommandBus bus, CancellationToken ct) =>
{
    var id = OrderId.New();
    await bus.PublishAsync(new PlaceOrderCommand(id, req.CustomerId), ct);
    return Results.Created($"/orders/{id.Value}", null);
});
```

A handler not found at runtime is a handler missing from `AddInfrastructure()`.
