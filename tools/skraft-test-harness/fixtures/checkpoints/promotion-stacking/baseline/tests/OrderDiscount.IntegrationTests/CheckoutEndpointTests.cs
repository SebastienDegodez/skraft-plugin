using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using OrderDiscount.Domain;
using OrderDiscount.Infrastructure;

namespace OrderDiscount.IntegrationTests;

/// <summary>
/// Boundary-to-boundary test of the checkout endpoint: seeds an order in the
/// in-memory repository, calls <c>POST /orders/{id}/checkout</c>, and asserts
/// the discounted payable total flowing back through the API.
/// </summary>
public sealed class CheckoutEndpointTests
{
    [Test]
    public async Task AppliesTheLoyaltyDiscountAtCheckout()
    {
        using var factory = new WebApplicationFactory<Program>();
        var orderId = Guid.NewGuid();
        var repository = factory.Services.GetService(typeof(InMemoryOrderRepository)) as InMemoryOrderRepository;
        var order = new Order(orderId);
        order.AddLine(new Money(100m));
        repository!.Save(order);

        using var client = factory.CreateClient();
        var response = await client.PostAsync($"/orders/{orderId}/checkout?tier=Gold", content: null);

        await Assert.That(response.StatusCode).IsEqualTo(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<CheckoutResponse>();
        await Assert.That(body!.PayableTotal).IsEqualTo(95m);
    }

    private sealed record CheckoutResponse(Guid OrderId, decimal PayableTotal);
}
