---
name: mocking-microcks-dotnet
description: Use when a .NET component's brief line says `mocking: microcks` (the default) and an integration test must mock a downstream dependency. Provides the Microcks Testcontainers wiring and the WebApplicationFactory scaffold that points the system-under-test's typed HttpClient at the mock URL.
---

# Mocking — Microcks x .NET (default)

Mocks a downstream dependency the SUT calls with a Microcks container seeded from that
dependency's OpenAPI/examples contract, wired into a `WebApplicationFactory` integration test.
Applies to a .NET component whose brief line says `mocking: microcks`. Write mock wiring and
the integration-test scaffold only; provider contract verification belongs to `contract-testing`.

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

Files: `test/{Sut}.IntegrationTests/{Sut}WebApplicationFactory.cs`. The tests need Docker.

## Rules

- Mock the DOWNSTREAM dependency, never the SUT itself.
- Use `MicrocksContainerEnsemble` + `WithMainArtifacts(...)`; resolve the mock
  endpoint with `GetRestMockEndpoint(name, version)` and inject it via `UseSetting`.
- `VerifyAsync` / `GetServiceInvocationsCountAsync` here only ASSERT the mock was
  used; they are not provider contract verification (that is a separate capability).
