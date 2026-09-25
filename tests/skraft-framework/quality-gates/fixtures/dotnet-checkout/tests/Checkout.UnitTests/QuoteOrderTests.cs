using Checkout.Application;

namespace Checkout.UnitTests;

public class QuoteOrderTests
{
    [Fact]
    public void A_quote_applies_the_customer_loyalty_tier()
    {
        var quote = new QuoteOrder(new KnownTiers(new Dictionary<string, string> { ["alice"] = "gold" }));

        Assert.Equal(90m, quote.Execute("alice", 100m));
    }

    private sealed class KnownTiers(Dictionary<string, string> tiers) : ICustomerTiers
    {
        public string TierOf(string customerId) => tiers[customerId];
    }
}
