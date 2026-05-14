# Contract Verification Reference

## VerifyAsync() Signature

```csharp
// On MicrocksContainer
Task<TestResult> VerifyAsync(
    string serviceId,          // Matches info.title in the contract
    string version,            // Matches info.version in the contract
    TimeSpan? timeout = null   // Default: 5 seconds per operation
);
```

---

## TestResult Type

```csharp
public class TestResult
{
    // True only when ALL operations in ALL examples pass
    public bool Success { get; }

    // Human-readable failure descriptions — empty when Success == true
    public IList<string> Failures { get; }

    // Per-operation detail
    public IList<OperationResult> OperationResults { get; }
}

public class OperationResult
{
    public string Operation { get; }       // e.g. "GET /eligibilities/{driverId}"
    public bool Success { get; }
    public IList<string> Messages { get; } // Failure details for this operation
}
```

---

## Basic Assertion Pattern

```csharp
var result = await _microcks.VerifyAsync("Eligibility Check API", "1.0.0");

// Fail with full detail on contract violation
Assert.True(result.Success, string.Join("\n", result.Failures));
```

---

## Assertion with Per-Operation Detail

```csharp
var result = await _microcks.VerifyAsync("Eligibility Check API", "1.0.0");

if (!result.Success)
{
    var detail = result.OperationResults
        .Where(op => !op.Success)
        .Select(op => $"[{op.Operation}] {string.Join(", ", op.Messages)}")
        .ToList();

    Assert.Fail($"Contract violations:\n{string.Join("\n", detail)}");
}
```

---

## What "Verified" Means

`VerifyAsync` replays every named example from `.apiexamples.yaml` against your running service:

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
| `Connection refused` | Service not running | Ensure service started before calling VerifyAsync |
| `Timeout after 5s` | Slow service or wrong URL | Increase timeout or fix mock URL registration |

---

## Integration with xUnit

### Option A — Single assertion per test

```csharp
[Fact]
public async Task Eligibility_API_satisfies_contract()
{
    // Service under test must be running and registered with Microcks
    var result = await _microcks.VerifyAsync("Eligibility Check API", "1.0.0");
    Assert.True(result.Success, string.Join("\n", result.Failures));
}
```

### Option B — Theory per operation

```csharp
[Theory]
[InlineData("GET /eligibilities/{driverId}")]
[InlineData("POST /eligibilities")]
public async Task Operation_satisfies_contract(string operation)
{
    var result = await _microcks.VerifyAsync("Eligibility Check API", "1.0.0");
    var opResult = result.OperationResults.FirstOrDefault(o => o.Operation == operation);

    Assert.NotNull(opResult);
    Assert.True(opResult.Success, string.Join("\n", opResult.Messages));
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
    private ApiIntegrationFactory _factory = null!;

    public async Task InitializeAsync()
    {
        _factory = new ApiIntegrationFactory();
        await _factory.InitializeAsync();
        _microcks = _factory.MicrocksContainer;
    }

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    [Fact(DisplayName = "Eligibility Check API satisfies OpenAPI contract")]
    public async Task Eligibility_check_api_satisfies_contract()
    {
        var result = await _microcks.VerifyAsync("Eligibility Check API", "1.0.0");
        Assert.True(result.Success, string.Join("\n", result.Failures));
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
1. Load contract into Microcks.
2. Start the real provider service.
3. Call `VerifyAsync` — Microcks drives the provider.
4. All examples pass → provider is contract-compliant.

**Consumer contract test flow:**
1. Load contract into Microcks.
2. Consumer code calls Microcks mock URL (not the real provider).
3. Assert consumer handles all mock responses correctly.
4. Microcks enforces that consumer only relies on contract-defined behavior.
