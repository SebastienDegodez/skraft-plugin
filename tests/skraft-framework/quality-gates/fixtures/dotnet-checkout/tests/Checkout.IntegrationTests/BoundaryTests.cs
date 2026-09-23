using Checkout.API;
using Checkout.Infrastructure;

namespace Checkout.IntegrationTests;

public class BoundaryTests
{
    private readonly InMemoryCustomerTiers tiers = new(new Dictionary<string, string> { ["alice"] = "gold" });

    [Fact]
    public void A_known_customer_keeps_its_tier() => Assert.Equal("gold", tiers.TierOf("alice"));

    [Fact]
    public void An_unknown_customer_is_standard() => Assert.Equal("standard", tiers.TierOf("bob"));

    [Fact]
    public void A_total_is_shown_with_two_decimals() => Assert.Equal("Total: 90.00", QuoteResponse.Format(90m));
}
