using System.Net;
using System.Net.Http.Json;
using Microcks.Testcontainers;
using Microcks.Testcontainers.Model;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using OrderDiscount.Api;
using DotNet.Testcontainers.Configurations;

namespace OrderDiscount.ContractTests;

/// <summary>
/// Provider-side contract test for the checkout API, following the SKRAFT
/// contract-testing recipe:
/// <list type="bullet">
///   <item><b>Layer 1 (always)</b> — a <see cref="WebApplicationFactory{TEntryPoint}"/>
///   + <see cref="HttpClient"/> baseline asserting the happy path and the 404
///   <c>application/problem+json</c> shape.</item>
///   <item><b>Layer 2 (opt-in)</b> — Microcks replays every example of the
///   published OpenAPI contract against the running service via
///   <c>TestEndpointAsync(OPEN_API_SCHEMA)</c> and validates each response.
///   Gated behind <c>SKRAFT_MICROCKS_LIVE=1</c> because it needs Docker.</item>
/// </list>
/// </summary>
public sealed class CheckoutContractTests
{
    private const string MicrocksImage = "quay.io/microcks/microcks-uber:1.14.0-native";
    private const string ServiceId = "Order Discount Checkout API:1.0.0";
    private static readonly string ContractPath =
        Path.Combine(AppContext.BaseDirectory, "contracts", "order-discount.openapi.yaml");

    // ── Layer 1 — baseline (ALWAYS) ──────────────────────────────────────────

    [Test]
    public async Task Baseline_CheckoutOfTheSeededOrderReturns200()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        var response = await client.PostAsync(
            $"/orders/{CheckoutApi.SampleOrderId}/checkout?tier=Gold", content: null);

        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<CheckoutResult>();
        await Assert.That(body!.PayableTotal).IsEqualTo(95m);
    }

    [Test]
    public async Task Baseline_CheckoutOfAnUnknownOrderReturns404ProblemDetails()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        var response = await client.PostAsync(
            $"/orders/{Guid.NewGuid()}/checkout?tier=Gold", content: null);

        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.NotFound);
        await Assert.That(response.Content.Headers.ContentType?.MediaType)
            .IsEqualTo("application/problem+json");
    }

    // ── Layer 2 — Microcks contract verification (opt-in) ────────────────────

    [Test]
    public async Task Service_satisfies_the_published_OpenAPI_contract()
    {
        if (!MicrocksLiveEnabled())
            return; // needs Docker — opt-in via SKRAFT_MICROCKS_LIVE=1

        // Boot the SUT on a real Kestrel port (a WebApplicationFactory hosts
        // in-memory and exposes no port the Microcks container can reach).
        await using var app = CheckoutHost.Create();
        app.Urls.Add("http://127.0.0.1:0");
        await app.StartAsync();

        var port = ResolveKestrelPort(app);
        await TestcontainersSettings
            .ExposeHostPortsAsync([(ushort)port])
            .ConfigureAwait(false);

        var microcks = new MicrocksBuilder()
            .WithImage(MicrocksImage)
            .WithMainArtifacts(ContractPath)
            .Build();
        await microcks.StartAsync();

        try
        {
            var request = new TestRequest
            {
                ServiceId = ServiceId,
                RunnerType = TestRunnerType.OPEN_API_SCHEMA,
                TestEndpoint = $"http://host.testcontainers.internal:{port}",
                Timeout = TimeSpan.FromSeconds(5),
            };

            var result = await microcks.TestEndpointAsync(request);

            await Assert.That(result.Success).IsTrue();
        }
        finally
        {
            await microcks.DisposeAsync();
            await app.StopAsync();
        }
    }

    private static int ResolveKestrelPort(IHost app)
    {
        var address = app.Services
            .GetRequiredService<IServer>()
            .Features
            .Get<IServerAddressesFeature>()!
            .Addresses
            .First();
        return int.Parse(address.Split(':').Last());
    }

    private static bool MicrocksLiveEnabled()
        => string.Equals(
            Environment.GetEnvironmentVariable("SKRAFT_MICROCKS_LIVE"),
            "1",
            StringComparison.Ordinal);

    private sealed record CheckoutResult(Guid OrderId, decimal PayableTotal);
}
