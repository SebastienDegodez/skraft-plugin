using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

[Trait("Scenario", "S4")]
public sealed class CalculateLoyaltyDiscountPromoCodeAcceptanceTests
{
    [Theory]
    [InlineData(10_000, LoyaltyTier.Silver, "WELCOME5", 1_500, 8_500)]
    [InlineData(20_000, LoyaltyTier.Gold, "WELCOME5", 2_500, 17_500)]
    [InlineData(2_000, LoyaltyTier.Bronze, "WELCOME5", 500, 1_500)]
    [InlineData(10_000, LoyaltyTier.Silver, "SUMMER", 1_000, 9_000)]
    public void WelcomeFivePromoCodeTakesFiveEurosOffAfterLoyaltyDiscount(int subtotalCents, LoyaltyTier loyaltyTier, string? promoCode, int expectedDiscountCents, int expectedTotalCents)
    {
        var useCase = new CalculateLoyaltyDiscount();

        var quote = useCase.Handle(new CalculateLoyaltyDiscountQuery(subtotalCents, loyaltyTier, promoCode));

        Assert.Equal(
            new LoyaltyDiscountQuote(subtotalCents, expectedDiscountCents, expectedTotalCents, loyaltyTier),
            quote);
    }
}
