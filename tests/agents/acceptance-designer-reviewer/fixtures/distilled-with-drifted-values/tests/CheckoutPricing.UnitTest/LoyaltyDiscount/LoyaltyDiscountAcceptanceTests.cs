using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

public class LoyaltyDiscountAcceptanceTests
{
    [Theory]
    [InlineData(LoyaltyTier.Bronze, 10_000, 9_500)]
    [InlineData(LoyaltyTier.Silver, 10_000, 9_000)]
    [InlineData(LoyaltyTier.Gold, 10_000, 8_400)]
    public void A_loyalty_tier_reduces_the_basket_subtotal(LoyaltyTier tier, int subtotalCents, int expectedTotalCents)
    {
        var handler = new CalculateLoyaltyDiscount();

        var quote = handler.Handle(new CalculateLoyaltyDiscountQuery(subtotalCents, tier));

        Assert.Equal(expectedTotalCents, quote.TotalCents);
    }
}
