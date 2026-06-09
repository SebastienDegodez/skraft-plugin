---
name: contract-testing-dotnet
description: Use when the contract-testing-roster resolved a .NET stack for a provider-side contract test. Always provides the baseline WebApplicationFactory + HttpClient integration test recipe; when the Microcks opt-in is enabled, additionally provides the MicrocksContainer + VerifyAsync layer that verifies response codes, headers, and ProblemDetails shape against the contract. Emits test wiring only; the business TDD cycle stays with the software-engineer lead.
---

# Contract Testing — .NET adapter (baseline + optional Microcks)

Concrete .NET recipe for a provider-side contract test of THIS service's API.
Extracted from the generic `contract-testing` skill so the generic skill keeps
only stack-agnostic authoring; this adapter owns the .NET delivery wiring.

Loaded ONLY when `contract-testing-roster` resolved a .NET stack. The roster also
passes the `microcks` opt-in flag.

**Boundary:** test wiring only. No business RED->GREEN, no Object Calisthenics,
no consumer-side mocking. The `software-engineer` lead integrates this into its
own TDD loop.

## Layer 1 — Baseline (ALWAYS emitted)

`WebApplicationFactory` + typed `HttpClient` integration test. This is produced
whether or not the Microcks opt-in is set.

```csharp
public class {Api}ContractTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public {Api}ContractTests(WebApplicationFactory<Program> factory)
        => _client = factory.CreateClient();

    [Fact]
    public async Task Get_unknown_resource_returns_problem_details_404()
    {
        var response = await _client.GetAsync("/resource/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json",
            response.Content.Headers.ContentType?.MediaType);

        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(problem);
        Assert.Equal(404, problem!.Status);
    }
}
```

## Layer 2 — Microcks contract verification (ONLY when opt-in == true)

Stack a Microcks contract test on top of the baseline. The provider-side approach
is `MicrocksContainer.TestEndpointAsync(TestRequest)` with the `OPEN_API_SCHEMA`
runner: Microcks replays every contract example against your RUNNING service and
validates each response. Seed the ensemble from the GENERIC contract artifacts
authored by the `contract-testing` skill.

NuGet: `Microcks.Testcontainers`, `Testcontainers`. The service must be reachable
from the container via `host.testcontainers.internal` on the Kestrel port
exposed with `TestcontainersSettings.ExposeHostPortsAsync(port)`.

```csharp
[Fact]
public async Task Service_satisfies_the_published_contract()
{
    // Microcks calls our running service with each example and validates responses.
    var request = new TestRequest
    {
        ServiceId = "{API Title}:1.0.0",          // matches info.title:version in the contract
        RunnerType = TestRunnerType.OPEN_API_SCHEMA,
        TestEndpoint = $"http://host.testcontainers.internal:{Port}/api",
    };

    var testResult = await MicrocksContainer.TestEndpointAsync(request);

    Assert.False(testResult.InProgress, "Test should not be in progress");
    Assert.True(testResult.Success, "Service must conform to the contract");
}
```

`TestEndpointAsync` asserts that every response code, header, and body field
(including `ProblemDetails` shape) matches the contract. Do NOT suppress a failing
`TestResult` (`testResult.Success == false`). `MicrocksContainer` is obtained from
the `MicrocksContainerEnsemble` set up in the test factory (see the
mocking-microcks-dotnet recipe for the ensemble + `ExposeHostPortsAsync` wiring).

## Structured result back to the lead

Return, do not commit:

```yaml
status: ok
capability: contract-testing
stack: dotnet
microcks: false | true
files:
  - test/{Api}.ContractTests/{Api}ContractTests.cs           # baseline (always)
  - test/{Api}.ContractTests/{Api}ContractVerification.cs    # only when microcks == true
testCommand: <resolved via resolving-stack-commands>
notes: baseline WAF+HttpClient always ; Microcks TestEndpointAsync(OPEN_API_SCHEMA) added iff opt-in
```

## Deep-dive references (generic skill)

For contract authoring, dispatcher rules, and sample formats, see the generic
[contract-testing](../contract-testing/SKILL.md) skill and its `references/`.

## Rules

- ALWAYS emit Layer 1, regardless of the opt-in.
- Add Layer 2 ONLY when `microcks: true`. Never replace the baseline with it.
- Layer 2 is `TestEndpointAsync(TestRequest{ OPEN_API_SCHEMA })` against
  `host.testcontainers.internal:{port}` — NOT `VerifyAsync` (that asserts a mock
  was used, a consumer-side concern). Never suppress a failing `TestResult`.
- Use `resolving-stack-commands` for the test command — never hardcode `dotnet test`.
