using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.Pricing;

public sealed class WholeCentPricingTests
{
    [Fact]
    public void Bronze_customer_pricing_a_7_cent_basket_is_charged_7_cents()
    {
        var quote = new CalculateLoyaltyDiscount().Handle(new CalculateLoyaltyDiscountQuery(7, LoyaltyTier.Bronze));

        Assert.Equal(7, quote.TotalCents);
    }
}
