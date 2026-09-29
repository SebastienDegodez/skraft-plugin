# Test Examples: Sociable Testing in Practice

## Example 1: Command Handler with Business Logic

### Domain: Order Aggregate

```csharp
namespace MyProject.Domain.Orders;

public sealed class Order
{
    private readonly List<OrderLine> _orderLines = new();
    
    public OrderId Id { get; }
    public CustomerId CustomerId { get; }
    public Address ShippingAddress { get; private set; }
    public OrderStatus Status { get; private set; }
    public IReadOnlyCollection<OrderLine> OrderLines => _orderLines.AsReadOnly();

    private Order(OrderId id, CustomerId customerId, Address shippingAddress)
    {
        Id = id;
        CustomerId = customerId;
        ShippingAddress = shippingAddress;
        Status = OrderStatus.Draft;
    }

    public static Order Create(OrderId id, CustomerId customerId, Address shippingAddress)
    {
        if (shippingAddress is null)
            throw new ArgumentNullException(nameof(shippingAddress));
            
        return new Order(id, customerId, shippingAddress);
    }

    public void RegisterOrderItem(ProductId productId, string productName, int quantity, decimal price)
    {
        if (quantity <= 0)
            throw new DomainException("Quantity must be greater than zero");
        if (price <= 0)
            throw new DomainException("Price must be greater than zero");
        if (string.IsNullOrWhiteSpace(productName))
            throw new DomainException("Product name cannot be empty");

        var orderLine = OrderLine.Create(productId, productName, quantity, price);
        _orderLines.Add(orderLine);
    }

    public void Confirm()
    {
        if (!_orderLines.Any())
            throw new DomainException("Cannot confirm order without items");
            
        Status = OrderStatus.Confirmed;
    }
}
```

### Application: Command Handler

```csharp
namespace MyProject.Application.Orders.Commands.PlaceOrder;

public sealed class PlaceOrderCommandHandler
{
    private readonly IOrderRepository _orderRepository;
    private readonly IInventoryService _inventoryService;

    public PlaceOrderCommandHandler(
        IOrderRepository orderRepository,
        IInventoryService inventoryService)
    {
        _orderRepository = orderRepository;
        _inventoryService = inventoryService;
    }

    public async Task<OrderId> Handle(
        PlaceOrderCommand command,
        CancellationToken cancellationToken = default)
    {
        // Create real Domain aggregate
        var order = Order.Create(
            command.OrderId,
            command.CustomerId,
            command.ShippingAddress
        );

        // Register items (Domain business logic)
        foreach (var line in command.OrderLines)
        {
            order.RegisterOrderItem(
                line.ProductId,
                line.ProductName,
                line.Quantity,
                line.Price
            );
        }

        // Confirm order (Domain business logic)
        order.Confirm();

        // Check inventory (Infrastructure - InMemory double in tests)
        await _inventoryService.ReserveItems(order.OrderLines, cancellationToken);

        // Persist (Infrastructure - InMemory double in tests)
        await _orderRepository.AddAsync(order, cancellationToken);

        return order.Id;
    }
}
```

### Test: Sociable Test for Command Handler

```csharp
namespace MyProject.UnitTest.Application.Orders.Commands;

public sealed class PlaceOrderCommandHandlerTests
{
    [Fact]
    public async Task WhenPlacingValidOrder_ShouldCreateConfirmedOrderWithItems()
    {
        // Arrange - InMemory doubles for Infrastructure only
        var orderRepository = new InMemoryOrderRepository();
        var inventoryService = new InMemoryInventoryService();
        var handler = new PlaceOrderCommandHandler(orderRepository, inventoryService);

        var orderId = OrderId.CreateNew();
        var customerId = CustomerId.CreateNew();
        var command = new PlaceOrderCommand(
            orderId,
            customerId,
            new List<OrderLineDto>
            {
                new(ProductId.CreateNew(), "Product A", 2, 10.00m),
                new(ProductId.CreateNew(), "Product B", 1, 25.00m)
            },
            new Address("123 Main St", "City", "Country")
        );

        // Act - Use real Domain objects
        var resultOrderId = await handler.Handle(command);

        // Assert - Observable state of the InMemory doubles and Domain state
        Assert.Equal(orderId, resultOrderId);

        Assert.Single(inventoryService.Reservations);

        var saved = Assert.Single(orderRepository.Orders.Values);
        Assert.Equal(orderId, saved.Id);
        Assert.Equal(customerId, saved.CustomerId);
        Assert.Equal(OrderStatus.Confirmed, saved.Status);
        Assert.Equal(2, saved.OrderLines.Count);
        Assert.Equal(2, saved.OrderLines.First().Quantity);
    }

    [Fact]
    public async Task WhenPlacingOrderWithInvalidQuantity_ShouldThrowDomainException()
    {
        // Arrange
        var orderRepository = new InMemoryOrderRepository();
        var inventoryService = new InMemoryInventoryService();
        var handler = new PlaceOrderCommandHandler(orderRepository, inventoryService);

        var command = new PlaceOrderCommand(
            OrderId.CreateNew(),
            CustomerId.CreateNew(),
            new List<OrderLineDto>
            {
                new(ProductId.CreateNew(), "Product A", -1, 10.00m) // Invalid quantity
            },
            new Address("123 Main St", "City", "Country")
        );

        // Act & Assert - Domain validation triggers exception
        await Assert.ThrowsAsync<DomainException>(() => handler.Handle(command));

        // Nothing was stored
        Assert.Empty(orderRepository.Orders);
    }

    [Fact]
    public async Task WhenPlacingOrderWithoutItems_ShouldThrowDomainException()
    {
        // Arrange
        var orderRepository = new InMemoryOrderRepository();
        var inventoryService = new InMemoryInventoryService();
        var handler = new PlaceOrderCommandHandler(orderRepository, inventoryService);

        var command = new PlaceOrderCommand(
            OrderId.CreateNew(),
            CustomerId.CreateNew(),
            new List<OrderLineDto>(), // Empty items
            new Address("123 Main St", "City", "Country")
        );

        // Act & Assert - Domain business rule enforced
        await Assert.ThrowsAsync<DomainException>(() => handler.Handle(command));
    }

    // Very simple InMemory doubles: a Dictionary / List behind the port interface.
    // Shared ones may live in the non-test TestKit project.
    private sealed class InMemoryOrderRepository : IOrderRepository
    {
        public Dictionary<OrderId, Order> Orders { get; } = new();

        public Task AddAsync(Order order, CancellationToken cancellationToken)
        {
            Orders[order.Id] = order;
            return Task.CompletedTask;
        }
    }

    private sealed class InMemoryInventoryService : IInventoryService
    {
        public List<IReadOnlyCollection<OrderLine>> Reservations { get; } = new();

        public Task ReserveItems(IReadOnlyCollection<OrderLine> lines, CancellationToken cancellationToken)
        {
            Reservations.Add(lines);
            return Task.CompletedTask;
        }
    }
}
```

## Example 2: Query Handler Test

### Query Handler

```csharp
namespace MyProject.Application.Orders.Queries.GetOrder;

public sealed class GetOrderQueryHandler
{
    private readonly IOrderRepository _orderRepository;

    public GetOrderQueryHandler(IOrderRepository orderRepository)
    {
        _orderRepository = orderRepository;
    }

    public async Task<OrderViewModel?> Handle(
        GetOrderQuery query,
        CancellationToken cancellationToken = default)
    {
        var order = await _orderRepository.GetByIdAsync(query.OrderId, cancellationToken);

        if (order is null)
            return null;

        return new OrderViewModel(
            order.Id,
            order.CustomerId,
            order.Status,
            order.OrderLines.Select(l => new OrderLineViewModel(
                l.ProductId,
                l.ProductName,
                l.Quantity,
                l.Price
            )).ToList()
        );
    }
}
```

### Query Test

```csharp
namespace MyProject.UnitTest.Application.Orders.Queries;

public sealed class GetOrderQueryHandlerTests
{
    [Fact]
    public async Task WhenGettingExistingOrder_ShouldReturnCorrectViewModel()
    {
        // Arrange
        var orderId = OrderId.CreateNew();
        var customerId = CustomerId.CreateNew();
        
        // Create real Domain object for test setup
        var order = Order.Create(
            orderId,
            customerId,
            new Address("123 Main St", "City", "Country")
        );
        order.RegisterOrderItem(
            ProductId.CreateNew(),
            "Product A",
            2,
            10.00m
        );
        order.Confirm();

        var orderRepository = new InMemoryOrderRepository();
        orderRepository.Orders[orderId] = order;

        var handler = new GetOrderQueryHandler(orderRepository);
        var query = new GetOrderQuery(orderId);

        // Act
        var result = await handler.Handle(query);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(orderId, result.Id);
        Assert.Equal(customerId, result.CustomerId);
        Assert.Equal(OrderStatus.Confirmed, result.Status);
        Assert.Single(result.OrderLines);
        Assert.Equal(2, result.OrderLines.First().Quantity);
    }

    [Fact]
    public async Task WhenGettingNonExistingOrder_ShouldReturnNull()
    {
        // Arrange
        var orderId = OrderId.CreateNew();
        var orderRepository = new InMemoryOrderRepository(); // empty

        var handler = new GetOrderQueryHandler(orderRepository);
        var query = new GetOrderQuery(orderId);

        // Act
        var result = await handler.Handle(query);

        // Assert
        Assert.Null(result);
    }

    // Very simple InMemory double: a Dictionary behind the port interface.
    private sealed class InMemoryOrderRepository : IOrderRepository
    {
        public Dictionary<OrderId, Order> Orders { get; } = new();

        public Task<Order?> GetByIdAsync(OrderId id, CancellationToken cancellationToken) =>
            Task.FromResult(Orders.TryGetValue(id, out var found) ? found : null);
    }
}
```

## Key Patterns

### ✅ DO: Use Real Domain Objects

```csharp
// Create real aggregates
var order = Order.Create(orderId, customerId, address);

// Invoke real Domain methods
order.RegisterOrderItem(productId, name, quantity, price);
order.Confirm();

// Verify Domain state
Assert.Equal(OrderStatus.Confirmed, order.Status);
```

### ❌ DON'T: Mock Domain Objects, or use a mocking library in the core

```csharp
// ❌ Bad: Mocking Domain behavior (and any mocking library is banned in Domain,
// Application and <Context>.UnitTest: G7 no-mocks-in-core.sh)
var fakeOrder = A.Fake<Order>();
A.CallTo(() => fakeOrder.RegisterOrderItem(...)).DoesNothing();
```

### ✅ DO: Replace Infrastructure with InMemory doubles

```csharp
// Hand-written InMemory repository and external service
var orderRepository = new InMemoryOrderRepository();
var inventoryService = new InMemoryInventoryService();
```

### ✅ DO: Assert on the observable state of the InMemory double

```csharp
// Assert on what the repository now holds, not on which calls were made
var saved = Assert.Single(orderRepository.Orders.Values);
Assert.Equal(expectedId, saved.Id);
Assert.Equal(OrderStatus.Confirmed, saved.Status);
```

### ✅ DO: Test Domain Validation

```csharp
// Domain validation throws exception
await Assert.ThrowsAsync<DomainException>(
    () => handler.Handle(invalidCommand)
);
```

## Benefits Demonstrated

1. **Real behavior**: Tests verify actual Domain logic
2. **Fast**: No external dependencies (< 100ms)
3. **Maintainable**: Tests focus on behavior, not implementation
4. **Refactoring-safe**: Changes to Domain structure don't break tests
5. **Clear intent**: Tests show how Domain and Application collaborate

## Example 3: Domain Logic Test (rare: only when Mandate 4 opens a gate; pure, no doubles)

This test exists only when `test-design-mandates` Mandate 4 opens Gate (a) or (b) and the test-plan records the Extraction Reason. By default the Use Case test above already covers the rule.

### Domain: Eligibility Policy

```csharp
namespace MonAssurance.Domain.Eligibility;

public sealed class EligibilityPolicy
{
    public EligibilityResult Evaluate(DriverInfo driver, VehicleInfo vehicle)
    {
        if (driver.Age < 18)
            return EligibilityResult.Rejected("driver_under_minimum_age");

        if (driver.LicenseYears < 2)
            return EligibilityResult.Rejected("insufficient_license_experience");

        if (vehicle.Age > 15)
            return EligibilityResult.Rejected("vehicle_too_old");

        return EligibilityResult.Eligible();
    }
}
```

### Test: Domain Policy Tests

```csharp
namespace MonAssurance.UnitTest.Domain.Eligibility;

public sealed class EligibilityPolicyTests
{
    private readonly EligibilityPolicy _policy = new();

    [Fact]
    public void WhenDriverIsUnder18_ShouldBeIneligible()
    {
        var driver = new DriverInfo(Age: 17, LicenseYears: 0);
        var vehicle = new VehicleInfo(Type: "sedan", Age: 1);

        var result = _policy.Evaluate(driver, vehicle);

        Assert.False(result.IsEligible);
        Assert.Equal("driver_under_minimum_age", result.RejectionReason);
    }

    [Fact]
    public void WhenDriverHasInsufficientExperience_ShouldBeIneligible()
    {
        var driver = new DriverInfo(Age: 25, LicenseYears: 1);
        var vehicle = new VehicleInfo(Type: "sedan", Age: 3);

        var result = _policy.Evaluate(driver, vehicle);

        Assert.False(result.IsEligible);
        Assert.Equal("insufficient_license_experience", result.RejectionReason);
    }

    [Fact]
    public void WhenVehicleIsTooOld_ShouldBeIneligible()
    {
        var driver = new DriverInfo(Age: 30, LicenseYears: 10);
        var vehicle = new VehicleInfo(Type: "sedan", Age: 16);

        var result = _policy.Evaluate(driver, vehicle);

        Assert.False(result.IsEligible);
        Assert.Equal("vehicle_too_old", result.RejectionReason);
    }

    [Fact]
    public void WhenAllCriteriaMet_ShouldBeEligible()
    {
        var driver = new DriverInfo(Age: 30, LicenseYears: 10);
        var vehicle = new VehicleInfo(Type: "sedan", Age: 3);

        var result = _policy.Evaluate(driver, vehicle);

        Assert.True(result.IsEligible);
    }
}
```

### Key Differences from Acceptance Tests

| Aspect | Acceptance Test | Domain Test |
|---|---|---|
| Dependencies | InMemory doubles for Infrastructure | None (pure) |
| Subject | Handler (orchestrator) | Domain service / policy (aggregates and VOs are not tested directly) |
| Assertions | InMemory double state + Domain state | Return value / Domain state only |
| When to use | Default: orchestration flows and the rules they carry | Only when `test-design-mandates` Mandate 4 opens a gate |
