using OrderDiscount.Application;
using OrderDiscount.Domain;
using OrderDiscount.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

var repository = new InMemoryOrderRepository();
builder.Services.AddSingleton<IOrderRepository>(repository);
builder.Services.AddSingleton(repository);
builder.Services.AddScoped<ApplyDiscountHandler>();

var app = builder.Build();

// POST /orders/{id}/checkout?tier=Gold -> { payableTotal }
app.MapPost("/orders/{id:guid}/checkout", (Guid id, LoyaltyTier tier, ApplyDiscountHandler handler) =>
{
    var result = handler.Handle(new ApplyDiscountRequest(id, tier));
    return Results.Ok(result);
});

app.Run();

public partial class Program;
