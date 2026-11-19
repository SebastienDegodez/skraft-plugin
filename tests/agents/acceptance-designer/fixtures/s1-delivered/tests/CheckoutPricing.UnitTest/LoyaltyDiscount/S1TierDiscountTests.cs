using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

public sealed class TierDiscountAcceptanceTests
{
    // Member receives the loyalty discount of their tier
    [Theory]
    [InlineData(LoyaltyTier.Bronze, 500, 9_500)]
    [InlineData(LoyaltyTier.Silver, 1_000, 9_000)]
    [InlineData(LoyaltyTier.Gold, 1_500, 8_500)]
    public void MemberReceivesTheLoyaltyDiscountOfTheirTier(LoyaltyTier loyaltyTier, int expectedDiscountCents, int expectedTotalCents)
    {
        var quote = new CalculateLoyaltyDiscount().Handle(new CalculateLoyaltyDiscountQuery(10_000, loyaltyTier));

        Assert.Equal(new LoyaltyDiscountQuote(10_000, expectedDiscountCents, expectedTotalCents, loyaltyTier), quote);
    }
}
