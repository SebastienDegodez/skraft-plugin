using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

[Trait("Scenario", "S7")]
public sealed class SummerTenPromoAcceptanceTests
{
    [Theory]
    [InlineData(10_000, LoyaltyTier.Silver, "SUMMER10", 1_900, 8_100)]
    [InlineData(30_000, LoyaltyTier.Bronze, "SUMMER10", 3_000, 27_000)]
    [InlineData(2_000, LoyaltyTier.Gold, "SUMMER10", 200, 1_800)]
    public void SummerTenTakesTenPercentOffWhatIsLeftAtMostFifteenEuros(int subtotalCents, LoyaltyTier loyaltyTier, string? promoCode, int expectedDiscountCents, int expectedTotalCents)
    {
        var useCase = new CalculateLoyaltyDiscount();

        var quote = useCase.Handle(new CalculateLoyaltyDiscountQuery(subtotalCents, loyaltyTier, promoCode));

        Assert.Equal(
            new LoyaltyDiscountQuote(subtotalCents, expectedDiscountCents, expectedTotalCents, loyaltyTier),
            quote);
    }
}
