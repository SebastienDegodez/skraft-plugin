# Project Structure Best Practices

## Domain Layer

```
Domain/
  IDomainMarker.cs
  Orders/
    Order.cs                    ← Aggregate root
    OrderLine.cs                ← Entity (owned by Order)
    OrderStatus.cs              ← Enum/Value Object
    OrderId.cs                  ← Strongly typed ID
    IOrderRepository.cs         ← Repository interface (NO implementation)
  Shared/
    DomainException.cs
    ValueObject.cs
```

**Rules:**
- No EF Core, no System.Data, no HTTP
- Interfaces only (implementations in Infrastructure)
- Business logic lives here

---

## Application Layer

```
Application/
  IApplicationMarker.cs
  Orders/                       ← one folder per feature
    PlaceOrderUseCase.cs
    GetOrderUseCase.cs
    OrderViewModel.cs
    IPaymentGateway.cs          ← interface this feature calls out through
  Shared/                       ← only what two features both use
```

**Rules:**
- References Domain only
- No Infrastructure implementations
- Orchestrates use cases
- A feature folder never uses another feature's namespace

---

## Infrastructure Layer

```
Infrastructure/
  IInfrastructureMarker.cs
  OrderingDbContext.cs          ← shared by every feature, at the root
  DependencyInjection.cs        ← DI registration, at the root
  Orders/
    SqlOrderRepository.cs       ← Implements IOrderRepository
    OrderConfiguration.cs       ← EF Core mapping of Order
    HttpPaymentGateway.cs       ← Implements IPaymentGateway
```

**Rules:**
- Implements interfaces from Domain/Application
- References EF Core, HTTP clients, etc.
- Registers handlers via convention

---

## API Layer

```
Api/
  IApiMarker.cs
  Orders/
    OrdersEndpoints.cs          ← Minimal API endpoints
  Program.cs
```

**Rules:**
- Does NOT reference Application assembly
- Injects `ICommandHandler<>` / `IQueryHandler<>`
- Infrastructure resolves handlers
