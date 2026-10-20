# .NET examples

## Plain use case: command and query

```csharp
// Application/Contacts/ContactUseCase.cs
public sealed class ContactUseCase(IContactRepository contacts)
{
    public Task CreateAsync(ContactId id, string name, CancellationToken ct) =>
        contacts.AddAsync(new Contact(id, name), ct);                 // command: returns Task

    public async Task<ContactViewModel?> GetAsync(ContactId id, CancellationToken ct) =>
        await contacts.FindAsync(id, ct) is { } c ? new ContactViewModel(c.Id.Value, c.Name) : null;
}

// Api/Contacts/ContactsEndpoints.cs
app.MapPost("/contacts", async (CreateContactRequest req, ContactUseCase useCase, CancellationToken ct) =>
{
    var id = ContactId.New();                                         // the caller creates the id
    await useCase.CreateAsync(id, req.Name, ct);
    return Results.Created($"/contacts/{id.Value}", null);
});
```

`Contact` has no rule to protect: it stays a plain record, its repository interface sits in
Application. A read-heavy query uses a read service instead: `IContactReadService` in Application
returns the ViewModel, Infrastructure projects it straight from the database
(`Select(c => new ContactViewModel(...))`).

## Aggregate

```csharp
// Domain/Orders/OrderId.cs
public sealed record OrderId(Guid Value) { public static OrderId New() => new(Guid.NewGuid()); }

// Domain/Orders/Order.cs
public sealed class Order : AggregateRoot
{
    public OrderId Id { get; }
    public UserId OwnerId { get; }
    public OrderStatus Status { get; private set; } = OrderStatus.Pending;

    private Order(OrderId id, UserId ownerId) { Id = id; OwnerId = ownerId; }

    public static Order Place(OrderId id, UserId ownerId)
    {
        var order = new Order(id, ownerId);
        order.AddDomainEvent(new OrderPlaced(id));
        return order;
    }

    public void Cancel(UserId requestedBy)
    {
        if (requestedBy != OwnerId) throw new DomainException("Only the owner can cancel this order");
        if (Status != OrderStatus.Pending) throw new DomainException("Only a pending order can be cancelled");
        Status = OrderStatus.Cancelled;
    }
}
```

`AggregateRoot` (in Domain) holds the `DomainEvents` list; `IOrderRepository` sits in Domain
because it persists an aggregate. Name the aggregate `Order`, never `OrderAggregate`.

## Who may read, who may change

```csharp
// Application/Orders/GetOrderUseCase.cs — read policy in the use case
public sealed class GetOrderUseCase(IOrderReadService orders, ICurrentUser currentUser)
{
    public async Task<OrderViewModel> GetAsync(OrderId id, CancellationToken ct)
    {
        var order = await orders.GetByIdAsync(id, ct) ?? throw new NotFoundException();
        if (order.OwnerId != currentUser.Id.Value) throw new ForbiddenException();
        return order;
    }
}

// Application/Orders/CancelOrderUseCase.cs — the change rule lives in Order.Cancel
public sealed class CancelOrderUseCase(IOrderRepository orders, ICurrentUser currentUser, IDomainEventDispatcher events)
{
    public async Task CancelAsync(OrderId id, CancellationToken ct)
    {
        var order = await orders.GetByIdAsync(id, ct) ?? throw new NotFoundException();
        order.Cancel(currentUser.Id);
        await orders.SaveAsync(order, ct);
        await events.DispatchAsync(order.DomainEvents, ct);          // after the save
    }
}
```

- Keep `GetByIdAsync` neutral; never `GetByIdAndOwnerAsync`, which merges 404 and 403. For a large
  list, add `ListByOwnerAsync(ownerId)` to the read service; the use case still decides to call it.
- `ICurrentUser` is declared in Application and implemented in Infrastructure from the
  `HttpContext` claims. Domain receives a `UserId`, never `ICurrentUser`.
- Token validation and role gates (`[Authorize(Roles = "Admin")]`) stay in Api middleware.
