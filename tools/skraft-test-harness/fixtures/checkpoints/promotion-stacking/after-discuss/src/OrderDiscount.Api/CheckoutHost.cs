namespace OrderDiscount.Api;

/// <summary>
/// Builds the checkout <see cref="WebApplication"/> from the shared
/// <see cref="CheckoutApi"/> wiring. Extracted from <c>Program</c> so the
/// provider-side Microcks contract test can boot the very same service on a
/// real Kestrel port — a <c>WebApplicationFactory</c> hosts in-memory and
/// exposes no port a container can reach.
/// </summary>
public static class CheckoutHost
{
    public static WebApplication Create(params string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.Services.AddCheckout();

        var app = builder.Build();
        app.Services.SeedSampleData();
        app.MapCheckout();
        return app;
    }
}
