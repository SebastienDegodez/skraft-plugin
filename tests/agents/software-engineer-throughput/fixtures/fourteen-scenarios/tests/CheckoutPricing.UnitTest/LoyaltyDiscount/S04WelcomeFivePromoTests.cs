using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

[Trait("Scenario", "S4")]
public sealed class WelcomeFivePromoAcceptanceTests
{
    [Theory]
    [InlineData(10_000, LoyaltyTier.Silver, "WELCOME5", 1_500, 8_500)]
    [InlineData(2_000, LoyaltyTier.Bronze, "WELCOME5", 500, 1_500)]
    public void WelcomeFiveTakesFiveEurosOffAfterLoyaltyDiscount(int subtotalCents, LoyaltyTier loyaltyTier, string? promoCode, int expectedDiscountCents, int expectedTotalCents)
    {
        var useCase = new CalculateLoyaltyDiscount();

        var quote = useCase.Handle(new CalculateLoyaltyDiscountQuery(subtotalCents, loyaltyTier, promoCode));

        Assert.Equal(
            new LoyaltyDiscountQuote(subtotalCents, expectedDiscountCents, expectedTotalCents, loyaltyTier),
            quote);
    }
}
