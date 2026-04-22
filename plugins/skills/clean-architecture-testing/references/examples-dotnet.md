# Examples per Layer

Full runnable examples. Each example matches the short snippet in `SKILL.md`.

## Domain — Pure Unit Test (rare, extracted rule only)

Only applies when a rule was extracted into a reusable Policy / Specification with a non-trivial edge-case matrix.

```csharp
public sealed class EligibilityPolicyTests
{
    [Theory]
    [InlineData(17, 0, false, "minimum_age_not_met")]
    [InlineData(18, 0, true, null)]
    [InlineData(25, 3, true, null)]
    public void Evaluate_ShouldApplyAgeAndExperienceRules(
        int age, int yearsOfExperience, bool expectedEligible, string? expectedReason)
    {
        var policy = new EligibilityPolicy();
        var user = new UserInfo(age, yearsOfExperience);
        var resource = new ResourceInfo("standard", 1);

        var result = policy.Evaluate(user, resource);

        result.IsEligible.Should().Be(expectedEligible);
        result.RejectionReason.Should().Be(expectedReason);
    }
}
```

**Not a Domain test:** a single `[Fact]` asserting `new Money(10, "EUR").Amount == 10`. Delete and rely on usage in Application tests.

## Application — Acceptance Test (default layer)

Sociable test: real domain objects, mocks only on output gateways.

```csharp
public sealed class PlaceOrderCommandHandlerTests
{
    [Fact]
    public async Task WhenPlacingOrder_ShouldPersistAndRaiseEvent()
    {
        var repository = A.Fake<IOrderRepository>();
        var dispatcher = A.Fake<IDomainEventDispatcher>();
        var handler = new PlaceOrderCommandHandler(repository, dispatcher);

        var command = new PlaceOrderCommand(OrderId.New(), "Alice");
        await handler.HandleAsync(command, CancellationToken.None);

        A.CallTo(() => repository.AddAsync(
                A<Order>.That.Matches(o =>
                    o.Id == command.OrderId &&
                    o.CustomerName == "Alice"),
                A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();

        A.CallTo(() => dispatcher.DispatchAsync(
                A<IEnumerable<DomainEvent>>.That.Matches(e =>
                    e.OfType<OrderPlacedEvent>().Any()),
                A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
    }

    [Fact]
    public async Task WhenCustomerNameIsEmpty_ShouldRejectBeforePersisting()
    {
        var repository = A.Fake<IOrderRepository>();
        var dispatcher = A.Fake<IDomainEventDispatcher>();
        var handler = new PlaceOrderCommandHandler(repository, dispatcher);

        var act = () => handler.HandleAsync(
            new PlaceOrderCommand(OrderId.New(), ""), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>();
        A.CallTo(() => repository.AddAsync(A<Order>._, A<CancellationToken>._))
            .MustNotHaveHappened();
    }
}
```

### When a hand-written fake is justified

When many tests need the repository to behave as a store:

```csharp
public sealed class InMemoryOrderRepository : IOrderRepository
{
    private readonly Dictionary<OrderId, Order> _store = new();

    public Task AddAsync(Order order, CancellationToken ct)
    {
        _store[order.Id] = order;
        return Task.CompletedTask;
    }

    public Task<Order?> FindAsync(OrderId id, CancellationToken ct)
        => Task.FromResult(_store.GetValueOrDefault(id));
}
```

Use when FakeItEasy setup becomes repetitive (>3 tests need the same state machine).

## Infrastructure — Integration Test with Testcontainers

One container per test class via `IAsyncLifetime`. Real provider, never `InMemoryDbContext`.

```csharp
public sealed class OrderRepositoryTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    private AppDbContext _ctx = null!;

    public async Task InitializeAsync()
    {
        await _db.StartAsync();
        _ctx = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(_db.GetConnectionString())
            .Options);
        await _ctx.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        await _ctx.DisposeAsync();
        await _db.DisposeAsync();
    }

    [Fact]
    public async Task AddAsync_ShouldPersistOrder()
    {
        var sut = new OrderRepository(_ctx);
        var order = Order.Create(OrderId.New(), "Alice");

        await sut.AddAsync(order, CancellationToken.None);

        var persisted = await _ctx.Orders.SingleAsync();
        persisted.CustomerName.Should().Be("Alice");
    }

    [Fact]
    public async Task FindAsync_WhenOrderMissing_ShouldReturnNull()
    {
        var sut = new OrderRepository(_ctx);

        var result = await sut.FindAsync(OrderId.New(), CancellationToken.None);

        result.Should().BeNull();
    }
}
```

### External HTTP adapter — Microcks mock (short sketch)

```csharp
public sealed class PaymentGatewayAdapterTests : IAsyncLifetime
{
    private readonly MicrocksContainer _microcks = new MicrocksBuilder()
        .WithMainArtifact("contracts/payment-openapi.yaml")
        .Build();

    public Task InitializeAsync() => _microcks.StartAsync();
    public Task DisposeAsync() => _microcks.DisposeAsync().AsTask();

    [Fact]
    public async Task Charge_ShouldReturnAuthorizationCode()
    {
        var httpClient = new HttpClient { BaseAddress = new Uri(_microcks.GetRestMockUrl("Payment API", "1.0")) };
        var sut = new PaymentGatewayAdapter(httpClient);

        var result = await sut.ChargeAsync(new ChargeRequest(Amount: 10m, Currency: "EUR"));

        result.AuthorizationCode.Should().NotBeNullOrEmpty();
    }
}
```

Full mocking + contract validation patterns (async protocols included) → upcoming `api-contract-testing` skill.

## API — E2E with WebApplicationFactory

One happy-path test per endpoint + walking skeleton.

```csharp
public sealed class OrdersEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public OrdersEndpointsTests(WebApplicationFactory<Program> factory) => _factory = factory;

    [Fact]
    public async Task PostOrders_WithValidBody_ShouldReturn201()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/orders",
            new { CustomerName = "Alice" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location.Should().NotBeNull();
    }

    [Fact]
    public async Task GetOrder_WhenMissing_ShouldReturn404()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync($"/orders/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
```

For E2E tests that hit a DB, override services in `WebApplicationFactory<Program>.WithWebHostBuilder` to wire a Testcontainers-backed `AppDbContext`. Downstream HTTP calls to external APIs → route them to Microcks.

## Architecture — NetArchTest Rules

```csharp
public sealed class ArchitectureTests
{
    [Fact]
    public void Domain_ShouldNotDependOn_Infrastructure()
        => AssertNoDependency(typeof(IDomainMarker).Assembly, "MyApp.Infrastructure");

    [Fact]
    public void Domain_ShouldNotDependOn_Application()
        => AssertNoDependency(typeof(IDomainMarker).Assembly, "MyApp.Application");

    [Fact]
    public void Application_ShouldNotDependOn_Infrastructure()
        => AssertNoDependency(typeof(IApplicationMarker).Assembly, "MyApp.Infrastructure");

    [Fact]
    public void Application_ShouldNotDependOn_Api()
        => AssertNoDependency(typeof(IApplicationMarker).Assembly, "MyApp.Api");

    [Fact]
    public void Api_ShouldNotDependOn_Application_Directly()
    {
        // API goes through Infrastructure DI; direct Application reference is forbidden.
        var result = Types.InAssembly(typeof(IApiMarker).Assembly)
            .That().DoNotHaveName("Program")
            .Should().NotHaveDependencyOn("MyApp.Application")
            .GetResult();

        result.IsSuccessful.Should().BeTrue(Format(result));
    }

    private static void AssertNoDependency(Assembly assembly, string forbidden)
    {
        var result = Types.InAssembly(assembly)
            .Should().NotHaveDependencyOn(forbidden)
            .GetResult();
        result.IsSuccessful.Should().BeTrue(Format(result));
    }

    private static string Format(TestResult result)
        => $"Violations: {string.Join(", ", result.FailingTypeNames ?? Array.Empty<string>())}";
}
```

Extended rule set → [architecture-rules.md](architecture-rules.md).
