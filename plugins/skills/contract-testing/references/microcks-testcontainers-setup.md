# Microcks Testcontainers Setup — .NET Reference

## NuGet Packages

```xml
<!-- Brings DotNet.Testcontainers transitively. Do not add the unrelated
     Testcontainers / TestContainers packages. -->
<PackageReference Include="Microcks.Testcontainers" Version="0.3.4" />
```

---

## MicrocksBuilder API

```csharp
var container = new MicrocksBuilder()
    // Load schema + examples + metadata in ONE call (schema first).
    .WithMainArtifacts(
        "contracts/eligibility-check-api.yaml")
    // Optional secondary artifacts (e.g. a shared schema reference).
    .WithSecondaryArtifacts(
        "contracts/eligibility-check-api.apiexamples.yaml",
        "contracts/eligibility-check-api.apimetadata.yaml",
        "contracts/shared-schemas.yaml")
    // Override the Microcks Docker image (uber distribution required).
    .WithImage("quay.io/microcks/microcks-uber:1.14.0-native")
    .Build();

await container.StartAsync();   // start the container after Build()
```

**There is no `BuildAsync()` and no singular `WithMainArtifact`.** `Build()`
returns the container; `StartAsync()` starts it. `WithMainArtifacts` /
`WithSecondaryArtifacts` take `params string[]`.

**Artifact loading order matters:** schema (OpenAPI/AsyncAPI) → examples → metadata.

---

## MicrocksContainer Methods

```csharp
// REST mock base URL for a named API and version — returns a Uri.
Uri restUrl = container.GetRestMockEndpoint("Eligibility Check API", "1.0.0");
// → http://localhost:{port}/rest/Eligibility+Check+API/1.0.0

// SOAP / GraphQL / gRPC mock endpoints
Uri soapUrl = container.GetSoapMockEndpoint("LegacyService", "1.0.0");
Uri graphqlUrl = container.GetGraphQLMockEndpoint("DriverProfile", "1.0.0");
Uri grpcUrl = container.GetGrpcMockEndpoint();

// PROVIDER conformance — replay the contract against your running service.
TestResult result = await container.TestEndpointAsync(new TestRequest
{
    ServiceId    = "Eligibility Check API:1.0.0",
    RunnerType   = TestRunnerType.OPEN_API_SCHEMA,
    TestEndpoint = $"http://host.testcontainers.internal:{port}",
    Timeout      = TimeSpan.FromSeconds(5),
});

// CONSUMER assertion — was the mock invoked? Returns a bool, NOT conformance.
bool wasHit = await container.VerifyAsync("Eligibility Check API", "1.0.0");
```

**`GetRestMockEndpoint` name encoding:** spaces become `+`. The name must match
`info.title` in the OpenAPI contract verbatim (case-sensitive).

---

## IAsyncLifetime Pattern (per test class)

```csharp
public class EligibilityContractTests : IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        _microcks = new MicrocksBuilder()
            .WithMainArtifacts(
                "contracts/eligibility-check-api.yaml",
                "contracts/eligibility-check-api.apiexamples.yaml",
                "contracts/eligibility-check-api.apimetadata.yaml")
            .Build();
        await _microcks.StartAsync();

        Uri mockUrl = _microcks.GetRestMockEndpoint("Eligibility Check API", "1.0.0");
        _client = new HttpClient { BaseAddress = mockUrl };
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
        _microcks = new MicrocksBuilder()
            .WithMainArtifacts(
                "contracts/eligibility-check-api.yaml",
                "contracts/eligibility-check-api.apiexamples.yaml")
            .Build();
        await _microcks.StartAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Remove the real registration
            var descriptor = services.SingleOrDefault(d =>
                d.ServiceType == typeof(IEligibilityGateway));
            if (descriptor != null) services.Remove(descriptor);

            // Register the SUT's downstream client with the Microcks mock endpoint
            Uri mockUrl = _microcks.GetRestMockEndpoint("Eligibility Check API", "1.0.0");
            services.AddHttpClient<IEligibilityGateway, HttpEligibilityGateway>(
                c => c.BaseAddress = mockUrl);
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
        Container = new MicrocksBuilder()
            .WithMainArtifacts(
                "contracts/eligibility-check-api.yaml",
                "contracts/eligibility-check-api.apiexamples.yaml")
            .Build();
        await Container.StartAsync();
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

## MicrocksContainerEnsemble

For testing a service that calls multiple downstream APIs:

```csharp
var network = new NetworkBuilder().Build();
var ensemble = new MicrocksContainerEnsemble(network, "quay.io/microcks/microcks-uber:1.14.0-native")
    .WithMainArtifacts(
        "contracts/eligibility-check-api.apiexamples.yaml",
        "contracts/driver-profile-api.apiexamples.yaml",
        "contracts/vehicle-catalog-api.apiexamples.yaml");
await ensemble.StartAsync();

// Get individual mock endpoints from the wrapped container.
Uri eligibilityUrl = ensemble.MicrocksContainer.GetRestMockEndpoint("Eligibility Check API", "1.0.0");
Uri driverUrl = ensemble.MicrocksContainer.GetRestMockEndpoint("Driver Profile API", "1.0.0");
```

---

## Artifact Path Resolution

Paths passed to `WithMainArtifacts` are resolved relative to the test project output directory.

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
