# Example 03 — Complete xUnit Test Class with WebApplicationFactory

**Pattern:** integration test for the MonAssurance eligibility HTTP endpoint using `WebApplicationFactory<Program>` with Microcks replacing the downstream eligibility gateway. This is a **consumer-side** test (the SUT calls OUT to the mocked downstream). Provider-side conformance of THIS service’s own API uses `TestEndpointAsync` on a real Kestrel port — see [contract-testing-dotnet](../../contract-testing-dotnet/SKILL.md).

---

## Project Layout

```
tests/
└── MonAssurance.IntegrationTests/
    ├── MonAssurance.IntegrationTests.csproj
    ├── contracts/
    │   ├── eligibility-check-api.yaml
    │   ├── eligibility-check-api.apiexamples.yaml
    │   └── eligibility-check-api.apimetadata.yaml
    └── Tests/
        ├── EligibilityEndpointTests.cs
        └── Infrastructure/
            └── EligibilityApiFactory.cs
```

---

## `.csproj` — NuGet References and Content Items

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" Version="10.0.0" />
    <!-- Brings DotNet.Testcontainers transitively. -->
    <PackageReference Include="Microcks.Testcontainers" Version="0.3.4" />
    <PackageReference Include="xunit" Version="2.9.0" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
    <PackageReference Include="coverlet.collector" Version="6.0.2" />
    <PackageReference Include="FakeItEasy" Version="8.3.0" />
  </ItemGroup>

  <!-- Copy Microcks contract artifacts to output directory -->
  <ItemGroup>
    <Content Include="contracts\**\*">
      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    </Content>
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\src\MonAssurance.Api\MonAssurance.Api.csproj" />
  </ItemGroup>
</Project>
```

---

## WebApplicationFactory with Microcks

```csharp
// tests/MonAssurance.IntegrationTests/Tests/Infrastructure/EligibilityApiFactory.cs

using Microcks.Testcontainers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using MonAssurance.Application.Ports;

namespace MonAssurance.IntegrationTests.Infrastructure;

/// <summary>
/// WebApplicationFactory that replaces the real IEligibilityGateway with a
/// Microcks mock loaded from the contract artifacts.
/// </summary>
public sealed class EligibilityApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;

    /// <summary>Exposes the container for VerifyAsync calls in tests.</summary>
    public MicrocksContainer Microcks => _microcks;

    public async Task InitializeAsync()
    {
        _microcks = new MicrocksBuilder()
            // Schema first, then examples, then dispatcher metadata — one call.
            .WithMainArtifacts(
                "contracts/eligibility-check-api.yaml",
                "contracts/eligibility-check-api.apiexamples.yaml",
                "contracts/eligibility-check-api.apimetadata.yaml")
            .Build();
        await _microcks.StartAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Remove the real HTTP-based gateway registered by the application
            var descriptor = services.SingleOrDefault(d =>
                d.ServiceType == typeof(IEligibilityGateway));

            if (descriptor is not null)
                services.Remove(descriptor);

            // Resolve the mock endpoint only after the container has started
            Uri mockUrl = _microcks.GetRestMockEndpoint("Eligibility Check API", "1.0.0");

            // Re-register the downstream client against the Microcks mock
            services.AddHttpClient<IEligibilityGateway, HttpEligibilityGateway>(client =>
                client.BaseAddress = mockUrl);
        });
    }

    public new async Task DisposeAsync()
    {
        await _microcks.DisposeAsync();
        await base.DisposeAsync();
    }
}
```

---

## Test Class

```csharp
// tests/MonAssurance.IntegrationTests/Tests/EligibilityEndpointTests.cs

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MonAssurance.IntegrationTests.Infrastructure;

namespace MonAssurance.IntegrationTests.Tests;

[Collection("EligibilityApi")]
public sealed class EligibilityEndpointTests : IClassFixture<EligibilityApiFactory>
{
    private readonly HttpClient _client;
    private readonly EligibilityApiFactory _factory;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public EligibilityEndpointTests(EligibilityApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    // -------------------------------------------------------------------------
    // Consumer tests: assert our API returns the correct response
    // using Microcks as the downstream mock
    // -------------------------------------------------------------------------

    [Fact(DisplayName = "GET /eligibilities/{driverId} returns 200 for eligible driver")]
    public async Task Get_eligible_driver_returns_200_and_eligible_result()
    {
        // Act
        var response = await _client.GetAsync("/eligibilities/DRV-001");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;

        Assert.Equal("DRV-001", root.GetProperty("driverId").GetString());
        Assert.True(root.GetProperty("eligible").GetBoolean());
    }

    [Fact(DisplayName = "GET /eligibilities/{driverId} returns 404 for unknown driver")]
    public async Task Get_unknown_driver_returns_404()
    {
        var response = await _client.GetAsync("/eligibilities/DRV-UNKNOWN");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        Assert.Equal("DRIVER_NOT_FOUND",
            doc.RootElement.GetProperty("code").GetString());
    }

    [Fact(DisplayName = "POST /eligibilities returns 200 with surcharge for young driver")]
    public async Task Post_young_driver_returns_eligible_with_surcharge()
    {
        // Arrange — 22 years old routes to "Young driver" example
        var request = new
        {
            driverAge = 22,
            vehicleType = "CAR",
            postalCode = "75001"
        };

        // Act
        var response = await _client.PostAsJsonAsync("/eligibilities", request);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<EligibilityResultDto>(JsonOptions);
        Assert.NotNull(result);
        Assert.True(result.Eligible);
        Assert.Equal(0.25, result.Surcharge);
    }

    [Fact(DisplayName = "POST /eligibilities returns 200 with ineligible for underage driver")]
    public async Task Post_underage_driver_returns_ineligible()
    {
        var request = new { driverAge = 16, vehicleType = "CAR" };

        var response = await _client.PostAsJsonAsync("/eligibilities", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<EligibilityResultDto>(JsonOptions);
        Assert.NotNull(result);
        Assert.False(result.Eligible);
        Assert.Equal("UNDERAGE", result.Reason);
    }

    // -------------------------------------------------------------------------
    // Consumer-side assertion: the downstream mock was actually exercised.
    // VerifyAsync returns a bool (mock-invocation check) — it is NOT provider
    // conformance. To verify THIS service against its own contract, boot it on a
    // real Kestrel port and use TestEndpointAsync(OPEN_API_SCHEMA); see
    // contract-testing-dotnet.
    // -------------------------------------------------------------------------

    [Fact(DisplayName = "Downstream eligibility mock was invoked")]
    public async Task Downstream_mock_was_invoked()
    {
        await _client.GetAsync("/eligibilities/DRV-001");

        bool invoked = await _factory.Microcks.VerifyAsync("Eligibility Check API", "1.0.0");
        Assert.True(invoked);
    }
}

// -------------------------------------------------------------------------
// DTOs (mirror the OpenAPI response schema)
// -------------------------------------------------------------------------

public record EligibilityResultDto(
    string? DriverId,
    bool Eligible,
    string? Reason,
    double? Surcharge,
    bool RequiresAdditionalReview);
```

---

## Teardown Flow

1. xUnit disposes `EligibilityApiFactory` after all tests in the class finish.
2. `DisposeAsync` calls `_microcks.DisposeAsync()` → stops and removes the Microcks Docker container.
3. `base.DisposeAsync()` shuts down the `WebApplicationFactory` in-process test server.

**Order is important:** dispose Microcks before the factory to avoid HTTP calls to a stopped container during factory shutdown.

---

## Design Notes

- `IClassFixture<EligibilityApiFactory>` starts the factory once per test class — Microcks container starts once.
- `CreateClient()` returns an `HttpClient` pre-configured with the test server base address (not the Microcks URL). The factory's `ConfigureWebHost` ensures the application's downstream calls route to Microcks.
- The `VerifyAsync` test runs last by convention; place it in a separate `[Collection]` if parallel execution order matters.
- `ConfigureWebHost` replaces the gateway registration. If the application uses keyed services or factory patterns, adapt the removal and re-registration logic accordingly.
