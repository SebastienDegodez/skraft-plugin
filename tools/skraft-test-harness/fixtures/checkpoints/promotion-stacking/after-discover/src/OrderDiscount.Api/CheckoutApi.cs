using OrderDiscount.Application;
using OrderDiscount.Domain;
using OrderDiscount.Infrastructure;

namespace OrderDiscount.Api;

/// <summary>
/// Composition + endpoint wiring for the checkout slice, extracted so both
/// <c>Program</c> and the provider-side contract test can boot the exact same
/// service on a real Kestrel port without duplicating registrations.
/// </summary>
public static class CheckoutApi
{
    /// <summary>
    /// Deterministic sample order referenced by the OpenAPI contract example, so
    /// Microcks can replay <c>POST /orders/{orderId}/checkout</c> against a known id.
    /// </summary>
    public static readonly Guid SampleOrderId = Guid.Parse("a1111111-1111-1111-1111-111111111111");

    public static IServiceCollection AddCheckout(this IServiceCollection services)
    {
        var repository = new InMemoryOrderRepository();
        services.AddSingleton(repository);
        services.AddSingleton<IOrderRepository>(repository);
        services.AddScoped<ApplyDiscountHandler>();
        return services;
    }

    /// <summary>Seeds the deterministic sample order (subtotal 100.00) used by the contract example.</summary>
    public static void SeedSampleData(this IServiceProvider services)
    {
        var repository = services.GetRequiredService<InMemoryOrderRepository>();
        var order = new Order(SampleOrderId);
        order.AddLine(new Money(100m));
        repository.Save(order);
    }

    public static void MapCheckout(this IEndpointRouteBuilder endpoints)
    {
        // POST /orders/{orderId}/checkout?tier=Gold
        //   -> 200 application/json        { orderId, payableTotal }
        //   -> 404 application/problem+json when the order is unknown
        endpoints.MapPost("/orders/{orderId:guid}/checkout",
            (Guid orderId, LoyaltyTier tier, IOrderRepository orders, ApplyDiscountHandler handler) =>
            {
                if (orders.FindById(orderId) is null)
                {
                    return Results.Problem(
                        title: "Order not found",
                        detail: $"Order '{orderId}' was not found.",
                        statusCode: StatusCodes.Status404NotFound);
                }

                var result = handler.Handle(new ApplyDiscountRequest(orderId, tier));
                return Results.Ok(result);
            });
    }
}
