# Example 03 — Complete xUnit Test Class with WebApplicationFactory

**Pattern:** integration test for the MonAssurance eligibility HTTP endpoint using `WebApplicationFactory<Program>` with Microcks replacing the downstream eligibility gateway.

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
    <PackageReference Include="Microcks.Testcontainers" Version="0.1.0" />
    <PackageReference Include="Testcontainers" Version="3.9.0" />
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
        _microcks = await new MicrocksBuilder()
            // Schema must load first
            .WithMainArtifact("contracts/eligibility-check-api.yaml")
            // Examples define mock responses
            .WithMainArtifact("contracts/eligibility-check-api.apiexamples.yaml")
            // Metadata defines dispatcher routing
            .WithMainArtifact("contracts/eligibility-check-api.apimetadata.yaml")
            .BuildAsync();
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

            // Resolve mock URL only after container has started
            var mockUrl = _microcks.GetRestMockUrl("Eligibility Check API", "1.0.0");

            // Re-register with Microcks mock URL
            services.AddHttpClient<IEligibilityGateway, HttpEligibilityGateway>(client =>
                client.BaseAddress = new Uri(mockUrl));
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
    // Contract verification: assert our implementation matches the OpenAPI spec
    // -------------------------------------------------------------------------

    [Fact(DisplayName = "Eligibility Check API implementation satisfies OpenAPI contract")]
    public async Task Implementation_satisfies_openapi_contract()
    {
        // VerifyAsync drives all examples in .apiexamples.yaml against the
        // running service via WebApplicationFactory and asserts responses match.
        var result = await _factory.Microcks.VerifyAsync(
            "Eligibility Check API",
            "1.0.0",
            timeout: TimeSpan.FromSeconds(15));

        Assert.True(result.Success, string.Join("\n", result.Failures));
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
