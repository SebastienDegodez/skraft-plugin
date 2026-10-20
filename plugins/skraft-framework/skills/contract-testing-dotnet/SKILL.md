---
name: contract-testing-dotnet
description: Use when a .NET component's brief says `contract testing: on` and its provider-side contract test must be written. Provides the WebApplicationFactory + HttpClient baseline test and the MicrocksContainer + TestEndpointAsync(OPEN_API_SCHEMA) test that replays the published contract against the running service and validates response codes, headers, and ProblemDetails shape.
---

# Contract Testing — .NET

Provider-side contract test of THIS service's API, for a .NET component whose brief line says
`contract testing: on`. Contract authoring (OpenAPI, `.apiexamples`, `.apimetadata`) follows
the `contract-testing` skill. Write both layers; write no consumer-side mock here.

## Layer 1 — In-process baseline

`WebApplicationFactory` + typed `HttpClient` integration test.

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

## Layer 2 — Microcks contract verification

Provider-side conformance
is `MicrocksContainer.TestEndpointAsync(TestRequest)` with the `OPEN_API_SCHEMA`
runner: Microcks replays every example of the published contract against your
RUNNING service and validates each response. Load the contract artifacts
(`{api}.yaml` + `.apiexamples.yaml` + `.apimetadata.yaml`) authored per the
generic `contract-testing` skill.

NuGet: `Microcks.Testcontainers` (it brings `DotNet.Testcontainers` transitively;
do not also reference the unrelated `Testcontainers`/`TestContainers` packages).

**Critical — a `WebApplicationFactory` cannot host Layer 2.** It serves the app
in-memory and exposes no TCP port the Microcks container can reach. Boot the SUT
on a real Kestrel port instead. Extract the app composition into a reusable
factory (e.g. `CheckoutHost.Create()` returning a `WebApplication`) so `Program`
and this test share the exact same wiring.

Real Microcks 0.3.4 API: `new MicrocksBuilder()...Build()` returns the container,
then `await container.StartAsync()`; `WithMainArtifacts(params string[])` loads
the artifacts in one call; `TestEndpointAsync(request)` is an extension method.

```csharp
[Fact]
public async Task Service_satisfies_the_published_contract()
{
    // 1. Boot the SUT on a real port (WebApplicationFactory has none).
    await using var app = CheckoutHost.Create();
    app.Urls.Add("http://127.0.0.1:0");
    await app.StartAsync();

    var address = app.Services.GetRequiredService<IServer>()
        .Features.Get<IServerAddressesFeature>()!.Addresses.First();
    var port = int.Parse(address.Split(':').Last());

    // 2. Expose that host port to the Microcks container network.
    await TestcontainersSettings.ExposeHostPortsAsync([(ushort)port]);

    // 3. Start Microcks seeded from the contract artifacts.
    var microcks = new MicrocksBuilder()
        .WithImage("quay.io/microcks/microcks-uber:1.14.0-native")
        .WithMainArtifacts(
            "contracts/{api}.yaml",
            "contracts/{api}.apiexamples.yaml",
            "contracts/{api}.apimetadata.yaml")
        .Build();
    await microcks.StartAsync();

    try
    {
        // 4. Microcks replays every example against the running service.
        var request = new TestRequest
        {
            ServiceId = "{API Title}:1.0.0",       // matches "info.title:info.version"
            RunnerType = TestRunnerType.OPEN_API_SCHEMA,
            TestEndpoint = $"http://host.testcontainers.internal:{port}",
            Timeout = TimeSpan.FromSeconds(5),
        };

        var testResult = await microcks.TestEndpointAsync(request);

        Assert.True(testResult.Success, "Service must conform to the contract");
    }
    finally
    {
        await microcks.DisposeAsync();
        await app.StopAsync();
    }
}
```

`TestEndpointAsync` asserts that every response code, header, and body field
(including the `ProblemDetails` shape) matches the contract. Do NOT suppress a
failing `TestResult` (`testResult.Success == false`).

> `VerifyAsync(name, version)` is a DIFFERENT method: in `Microcks.Testcontainers`
> it returns a `bool` checking how many times a MOCK was invoked — a consumer-side
> concern. It is NOT provider conformance. Use `TestEndpointAsync` here.

Files: `test/{Api}.ContractTests/{Api}ContractTests.cs` (Layer 1) and
`test/{Api}.ContractTests/{Api}ContractVerification.cs` (Layer 2). Layer 2 needs Docker.

## Rules

- Write both layers; Layer 2 never replaces Layer 1.
- Layer 2 is `TestEndpointAsync(TestRequest{ OPEN_API_SCHEMA })` against
  `host.testcontainers.internal:{port}` — NOT `VerifyAsync` (that returns a `bool`
  asserting a mock was invoked, a consumer-side concern). Never suppress a failing
  `TestResult`.
- Layer 2 needs a real Kestrel port: a `WebApplicationFactory` exposes none. Boot
  the SUT via a shared host factory and read the port from `IServerAddressesFeature`.
- Real API: `MicrocksBuilder...Build()` + `await StartAsync()`,
  `WithMainArtifacts(params string[])`, `container.TestEndpointAsync(request)`.
  There is no `BuildAsync`, no singular `WithMainArtifact`.
