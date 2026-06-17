---
name: mocking-microcks-dotnet
description: Use when the mocking-strategy-roster resolved (microcks, .NET) — the default mocking strategy for a .NET integration test. Provides the concrete Microcks Testcontainers wiring and the WebApplicationFactory scaffold that points the system-under-test's typed HttpClient at the mock URL. Emits mock wiring only; the business TDD cycle stays with the software-engineer lead.
---

# Mocking — Microcks x .NET adapter (default)

Concrete recipe that mocks a downstream dependency the SUT calls, using a
Microcks container seeded from the dependency's OpenAPI/examples contract, and
wires it into a `WebApplicationFactory` integration test.

Loaded ONLY when `mocking-strategy-roster` resolved `(microcks, .NET)`.

**Boundary:** this adapter produces mock wiring + an integration-test scaffold.
It does NOT drive RED->GREEN, does NOT enforce Object Calisthenics, does NOT
verify a provider contract (`VerifyAsync` is contract-testing, a different
capability). The `software-engineer` lead integrates this into its own TDD loop.

## NuGet packages

```
Microcks.Testcontainers
Testcontainers
```

## Recipe — mock the downstream + wire the test host

Use a `MicrocksContainerEnsemble` seeded from the DOWNSTREAM dependency's
contract, then point the SUT's client at the mock endpoint via configuration.
The real API is `GetRestMockEndpoint(serviceName, version)` (note: `+` encodes a
space in the service name, e.g. `"API+Pastries"`).

```csharp
public class {Sut}WebApplicationFactory<TProgram> : WebApplicationFactory<TProgram>, IAsyncLifetime
    where TProgram : class
{
    private const string MicrocksImage = "quay.io/microcks/microcks-uber:1.14.0-native";
    public MicrocksContainerEnsemble MicrocksContainerEnsemble { get; private set; } = null!;

    public async ValueTask InitializeAsync()
    {
        var network = new NetworkBuilder().Build();
        // Seed mocks from the DOWNSTREAM dependency's contract (not our API).
        MicrocksContainerEnsemble = new MicrocksContainerEnsemble(network, MicrocksImage)
            .WithMainArtifacts("resources/third-parties/{downstream-api}-openapi.yaml");
        await MicrocksContainerEnsemble.StartAsync().ConfigureAwait(true);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        var microcks = MicrocksContainerEnsemble.MicrocksContainer;
        // Point the SUT's downstream client at the Microcks mock endpoint.
        var endpoint = microcks.GetRestMockEndpoint("{Downstream+API+Name}", "1.0.0");
        builder.UseSetting("{Downstream}Api:BaseUrl", $"{endpoint}");
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await MicrocksContainerEnsemble.DisposeAsync();
    }
}
```

The test resolves the SUT's downstream client from `Factory.Services` and
exercises it; calls flow through the configured base URL to the Microcks mock.
To assert the mock was actually hit, use
`microcks.VerifyAsync("{Downstream+API+Name}", "1.0.0")` or
`GetServiceInvocationsCountAsync(...)`.

## Structured result back to the lead

Return, do not commit:

```yaml
strategy: microcks
stack: dotnet
files:
  - test/{Sut}.IntegrationTests/{Sut}WebApplicationFactory.cs
testCommand: <resolved via resolving-stack-commands>   # e.g. dotnet test
notes: MicrocksContainerEnsemble seeded from {downstream-api} contract ; SUT base URL -> GetRestMockEndpoint
```

## Rules

- Mock the DOWNSTREAM dependency, never the SUT itself.
- Use `MicrocksContainerEnsemble` + `WithMainArtifacts(...)`; resolve the mock
  endpoint with `GetRestMockEndpoint(name, version)` and inject it via `UseSetting`.
- Use `resolving-stack-commands` for the test command — never hardcode `dotnet test`.
- `VerifyAsync` / `GetServiceInvocationsCountAsync` here only ASSERT the mock was
  used; they are not provider contract verification (that is a separate capability).
