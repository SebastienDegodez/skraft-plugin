using Checkout.Application;
using Checkout.Domain;
using Checkout.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// The downstream base URL is configuration, never a constant: this is the seam a
// test host repoints at a mock.
builder.Services.AddHttpClient<IEligibilityClient, EligibilityHttpClient>(client =>
{
    var baseUrl = builder.Configuration["EligibilityApi:BaseUrl"] ?? "http://localhost:5999";
    client.BaseAddress = new Uri(baseUrl);
});
builder.Services.AddScoped<ApproveCheckout>();

var app = builder.Build();

app.MapPost("/checkout/approve", async (Basket basket, ApproveCheckout approve, CancellationToken token) =>
    await approve.ForAsync(basket, token)
        ? Results.Ok(new { approved = true })
        : Results.Ok(new { approved = false }));

app.Run();

public partial class Program;
