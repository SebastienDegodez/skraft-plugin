# Contract Verification Reference

Provider-side conformance uses the `OPEN_API_SCHEMA` test runner: Microcks calls
your RUNNING service with every example from the contract and validates each
response. The entry point is the `TestEndpointAsync` extension on
`MicrocksContainer`.

## TestEndpointAsync() Signature

```csharp
// Extension on MicrocksContainer
Task<TestResult> TestEndpointAsync(
    this MicrocksContainer container,
    TestRequest testRequest,
    CancellationToken cancellationToken = default);
```

```csharp
var request = new TestRequest
{
    ServiceId    = "Eligibility Check API:1.0.0",  // "info.title:info.version"
    RunnerType   = TestRunnerType.OPEN_API_SCHEMA,
    TestEndpoint = $"http://host.testcontainers.internal:{port}",
    Timeout      = TimeSpan.FromSeconds(5),
};
```


---

## TestResult Type

```csharp
public class TestResult
{
    // True only when ALL examples for ALL operations passed.
    public bool Success { get; }
    public bool InProgress { get; }
    public string ServiceId { get; }
    public string TestedEndpoint { get; }

    // Per-operation detail.
    public List<TestCaseResult> TestCaseResults { get; }
}

public class TestCaseResult
{
    public bool Success { get; }
    public string OperationName { get; }   // e.g. "GET /eligibilities/{driverId}"
    public List<TestStepResult> TestStepResults { get; }
}
```

---

## Basic Assertion Pattern

```csharp
var result = await microcks.TestEndpointAsync(request);
Assert.True(result.Success);   // do not suppress a failing TestResult
```

---

## Assertion with Per-Operation Detail

```csharp
var result = await microcks.TestEndpointAsync(request);

if (!result.Success)
{
    var failing = result.TestCaseResults
        .Where(tc => !tc.Success)
        .Select(tc => tc.OperationName)
        .ToList();

    Assert.Fail($"Contract violations on: {string.Join(", ", failing)}");
}
```

---

## What "Verified" Means

`TestEndpointAsync(OPEN_API_SCHEMA)` replays every named example from
`.apiexamples.yaml` against your running service:

1. Sends the example's `request` (parameters, headers, body) to the service endpoint.
2. Compares the actual response against the example's `response` (code, headers, body).
3. Returns `Success = true` only if ALL examples pass for ALL operations.

**Body comparison:** JSON fields are compared structurally (order-independent). Extra fields in the response body do not cause failure unless strict mode is enabled.

**Status code:** must match exactly — a 200 example that returns 201 fails verification.

**Headers:** only headers declared in the example are checked; additional response headers are ignored.

---

## Common Failure Messages

| Failure message | Cause | Fix |
|---|---|---|
| `Expected status 200 but got 404` | Route not found | Check URL path and operationId alignment |
| `Body mismatch: expected field 'eligible' not found` | Response missing required field | Add field to implementation response |
| `Expected status 200 but got 500` | Implementation error | Fix the implementation, not the contract |
| `No matching example found` | Dispatcher misconfiguration | Check dispatcher rules match example names |
| `Connection refused` | Service not running | Ensure service started before calling TestEndpointAsync |
| `Timeout after 5s` | Slow service or wrong URL | Increase timeout or fix mock URL registration |

---

## Integration with xUnit

### Option A — Single assertion per test

```csharp
[Fact]
public async Task Eligibility_API_satisfies_contract()
{
    // Service under test must be running on a real port (boot real Kestrel).
    var result = await microcks.TestEndpointAsync(request);
    Assert.True(result.Success);
}
```

### Option B — Theory per operation

```csharp
[Theory]
[InlineData("GET /eligibilities/{driverId}")]
[InlineData("POST /eligibilities")]
public async Task Operation_satisfies_contract(string operation)
{
    var result = await microcks.TestEndpointAsync(request);
    var opResult = result.TestCaseResults.FirstOrDefault(o => o.OperationName == operation);

    Assert.NotNull(opResult);
    Assert.True(opResult!.Success);
}
```

---

## CI Gate Rule

Add a dedicated contract verification test job:

```yaml
# In CI pipeline — runs after integration tests
- name: Contract Verification Gate
  run: dotnet test --filter "FullyQualifiedName~ContractVerification" --logger trx
```

**Contract verification test class:**
```csharp
[Trait("Category", "ContractVerification")]
public class EligibilityContractVerificationTests : IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;
    private WebApplication _app = null!;
    private int _port;

    public async Task InitializeAsync()
    {
        // Boot the SUT on a real Kestrel port (a WebApplicationFactory exposes none).
        _app = CheckoutHost.Create();
        _app.Urls.Add("http://127.0.0.1:0");
        await _app.StartAsync();
        var address = _app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();
        _port = int.Parse(address.Split(':').Last());
        await TestcontainersSettings.ExposeHostPortsAsync([(ushort)_port]);

        _microcks = new MicrocksBuilder()
            .WithMainArtifacts(
                "contracts/eligibility-check-api.yaml",
                "contracts/eligibility-check-api.apiexamples.yaml",
                "contracts/eligibility-check-api.apimetadata.yaml")
            .Build();
        await _microcks.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await _microcks.DisposeAsync();
        await _app.StopAsync();
    }

    [Fact(DisplayName = "Eligibility Check API satisfies OpenAPI contract")]
    public async Task Eligibility_check_api_satisfies_contract()
    {
        var result = await _microcks.TestEndpointAsync(new TestRequest
        {
            ServiceId    = "Eligibility Check API:1.0.0",
            RunnerType   = TestRunnerType.OPEN_API_SCHEMA,
            TestEndpoint = $"http://host.testcontainers.internal:{_port}",
            Timeout      = TimeSpan.FromSeconds(5),
        });
        Assert.True(result.Success);
    }
}
```

**CI gate rule:** the contract verification test MUST run and MUST pass before merge. A `result.Success == false` is a build-blocking failure — do not catch and swallow it.

---

## Provider-Side vs. Consumer-Side Testing

| Mode | When to use | What it checks |
|---|---|---|
| **Provider verification** | In the provider's test suite | My implementation matches the published contract |
| **Consumer contract test** | In the consumer's test suite | The provider mock (Microcks) behaves as my code expects |

**Provider verification flow:**
1. Load the contract artifacts into Microcks (`WithMainArtifacts`).
2. Start the real provider service on a reachable TCP port (real Kestrel).
3. Call `TestEndpointAsync(OPEN_API_SCHEMA)` — Microcks drives the provider.
4. All examples pass → provider is contract-compliant.

**Consumer contract test flow:**
1. Load the downstream contract into Microcks.
2. Consumer code calls the Microcks mock endpoint (`GetRestMockEndpoint`), not the real provider.
3. Assert the consumer handles all mock responses correctly.
4. Optionally assert the mock was actually hit with `VerifyAsync(name, version)` (bool).
