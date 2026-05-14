# Microcks Testcontainers Setup — .NET Reference

## NuGet Packages

```xml
<PackageReference Include="Microcks.Testcontainers" Version="0.1.0" />
<PackageReference Include="Testcontainers" Version="3.9.0" />
```

---

## MicrocksBuilder API

```csharp
var container = await new MicrocksBuilder()
    // Load OpenAPI / AsyncAPI schema (defines operations and schemas)
    .WithMainArtifact("path/to/contract.yaml")
    // Load APIExamples (defines response examples per operation)
    .WithMainArtifact("path/to/contract.apiexamples.yaml")
    // Load APIMetadata (defines dispatcher rules)
    .WithMainArtifact("path/to/contract.apimetadata.yaml")
    // Load a secondary artifact (e.g., imported schema reference)
    .WithSecondaryArtifact("path/to/shared-schemas.yaml")
    // Override the Microcks Docker image version
    .WithImage("quay.io/microcks/microcks-uber:1.9.1")
    .BuildAsync();
```

**Artifact loading order matters:** schema (OpenAPI/AsyncAPI) → examples → metadata.

---

## MicrocksContainer Methods

```csharp
// REST mock base URL for a named API and version
string restUrl = container.GetRestMockUrl("Eligibility Check API", "1.0.0");
// → http://localhost:{port}/rest/Eligibility+Check+API/1.0.0

// SOAP mock URL
string soapUrl = container.GetSoapMockUrl("LegacyService", "1.0.0");

// gRPC mock URL (host:port, no scheme)
string grpcUrl = container.GetGrpcMockUrl("DriverProfileService", "1.0.0");

// Verify provider contract — returns TestResult
TestResult result = await container.VerifyAsync(
    serviceId: "Eligibility Check API",
    version: "1.0.0",
    timeout: TimeSpan.FromSeconds(10)  // optional, default 5s
);
```

**`GetRestMockUrl` name encoding:** spaces become `+`. The name must match `info.title` in the OpenAPI contract verbatim (case-sensitive).

---

## IAsyncLifetime Pattern (per test class)

```csharp
public class EligibilityContractTests : IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        _microcks = await new MicrocksBuilder()
            .WithMainArtifact("contracts/eligibility-check-api.yaml")
            .WithMainArtifact("contracts/eligibility-check-api.apiexamples.yaml")
            .WithMainArtifact("contracts/eligibility-check-api.apimetadata.yaml")
            .BuildAsync();

        var mockUrl = _microcks.GetRestMockUrl("Eligibility Check API", "1.0.0");
        _client = new HttpClient { BaseAddress = new Uri(mockUrl) };
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _microcks.DisposeAsync();
    }
}
```

---

## WebApplicationFactory Integration

Replace the real downstream HTTP client with the Microcks mock URL inside the factory.

```csharp
public class ApiIntegrationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;

    public async Task InitializeAsync()
    {
        _microcks = await new MicrocksBuilder()
            .WithMainArtifact("contracts/eligibility-check-api.yaml")
            .WithMainArtifact("contracts/eligibility-check-api.apiexamples.yaml")
            .BuildAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Remove the real registration
            var descriptor = services.SingleOrDefault(d =>
                d.ServiceType == typeof(IEligibilityGateway));
            if (descriptor != null) services.Remove(descriptor);

            // Register with Microcks mock URL
            var mockUrl = _microcks.GetRestMockUrl("Eligibility Check API", "1.0.0");
            services.AddHttpClient<IEligibilityGateway, HttpEligibilityGateway>(
                c => c.BaseAddress = new Uri(mockUrl));
        });
    }

    public new async Task DisposeAsync()
    {
        await _microcks.DisposeAsync();
        await base.DisposeAsync();
    }
}
```

**Test class using the factory:**
```csharp
public class EligibilityEndpointTests : IClassFixture<ApiIntegrationFactory>
{
    private readonly HttpClient _client;

    public EligibilityEndpointTests(ApiIntegrationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Get_eligibility_returns_200_for_eligible_driver()
    {
        var response = await _client.GetAsync("/eligibilities/DRV-001");
        response.EnsureSuccessStatusCode();
    }
}
```

---

## Collection Fixture (Shared Microcks Instance)

Avoids container startup cost when multiple test classes share the same contracts.

```csharp
// 1. Define the collection
[CollectionDefinition("Microcks")]
public class MicrocksCollection : ICollectionFixture<MicrocksFixture> { }

// 2. Define the fixture
public class MicrocksFixture : IAsyncLifetime
{
    public MicrocksContainer Container { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        Container = await new MicrocksBuilder()
            .WithMainArtifact("contracts/eligibility-check-api.yaml")
            .WithMainArtifact("contracts/eligibility-check-api.apiexamples.yaml")
            .BuildAsync();
    }

    public async Task DisposeAsync() => await Container.DisposeAsync();
}

// 3. Consume the fixture
[Collection("Microcks")]
public class EligibilityContractTests
{
    private readonly MicrocksContainer _microcks;

    public EligibilityContractTests(MicrocksFixture fixture)
    {
        _microcks = fixture.Container;
    }
}
```

---

## MicrocksContainersEnsemble

For testing a service that calls multiple downstream APIs:

```csharp
var ensemble = await new MicrocksContainersEnsembleBuilder()
    .WithMainArtifact("contracts/eligibility-check-api.apiexamples.yaml")
    .WithMainArtifact("contracts/driver-profile-api.apiexamples.yaml")
    .WithMainArtifact("contracts/vehicle-catalog-api.apiexamples.yaml")
    .BuildAsync();

// Get individual mock URLs from the ensemble
string eligibilityUrl = ensemble.GetRestMockUrl("Eligibility Check API", "1.0.0");
string driverUrl = ensemble.GetRestMockUrl("Driver Profile API", "1.0.0");
```

---

## Artifact Path Resolution

Paths passed to `WithMainArtifact` are resolved relative to the test project output directory.

**Recommended:** add contracts as content files copied to output in the `.csproj`:
```xml
<ItemGroup>
  <Content Include="contracts\**\*">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
  </Content>
</ItemGroup>
```

**Directory layout in test project:**
```
MonAssurance.IntegrationTests/
├── contracts/
│   ├── eligibility-check-api.yaml
│   ├── eligibility-check-api.apiexamples.yaml
│   └── eligibility-check-api.apimetadata.yaml
└── Tests/
    └── EligibilityContractTests.cs
```
