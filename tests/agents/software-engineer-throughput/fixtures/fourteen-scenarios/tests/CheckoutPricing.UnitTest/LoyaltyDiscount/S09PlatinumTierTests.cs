using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

[Trait("Scenario", "S9")]
public sealed class PlatinumTierAcceptanceTests
{
    [Theory]
    [InlineData(10_000, LoyaltyTier.Platinum, null, 2_000, 8_000)]
    [InlineData(5_000, LoyaltyTier.Platinum, null, 1_000, 4_000)]
    [InlineData(20_000, LoyaltyTier.Platinum, null, 2_000, 18_000)]
    public void PlatinumMembersReceiveTwentyPercent(int subtotalCents, LoyaltyTier loyaltyTier, string? promoCode, int expectedDiscountCents, int expectedTotalCents)
    {
        var useCase = new CalculateLoyaltyDiscount();

        var quote = useCase.Handle(new CalculateLoyaltyDiscountQuery(subtotalCents, loyaltyTier, promoCode));

        Assert.Equal(
            new LoyaltyDiscountQuote(subtotalCents, expectedDiscountCents, expectedTotalCents, loyaltyTier),
            quote);
    }
}
