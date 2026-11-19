using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

[Trait("Scenario", "S2")]
public sealed class CalculateLoyaltyDiscountCapAcceptanceTests
{
    [Theory]
    [InlineData(20_000, LoyaltyTier.Gold, null, 2_000, 18_000)]
    [InlineData(30_000, LoyaltyTier.Silver, null, 2_000, 28_000)]
    [InlineData(12_000, LoyaltyTier.Gold, null, 1_800, 10_200)]
    public void LoyaltyDiscountNeverExceedsTwentyEuros(int subtotalCents, LoyaltyTier loyaltyTier, string? promoCode, int expectedDiscountCents, int expectedTotalCents)
    {
        var useCase = new CalculateLoyaltyDiscount();

        var quote = useCase.Handle(new CalculateLoyaltyDiscountQuery(subtotalCents, loyaltyTier, promoCode));

        Assert.Equal(
            new LoyaltyDiscountQuote(subtotalCents, expectedDiscountCents, expectedTotalCents, loyaltyTier),
            quote);
    }
}
