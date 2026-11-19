using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

[Trait("Scenario", "S6")]
public sealed class PromoCodeCaseAcceptanceTests
{
    [Theory]
    [InlineData(10_000, LoyaltyTier.Silver, "welcome5", 1_500, 8_500)]
    [InlineData(10_000, LoyaltyTier.Silver, "Welcome5", 1_500, 8_500)]
    public void PromoCodesIgnoreCase(int subtotalCents, LoyaltyTier loyaltyTier, string? promoCode, int expectedDiscountCents, int expectedTotalCents)
    {
        var useCase = new CalculateLoyaltyDiscount();

        var quote = useCase.Handle(new CalculateLoyaltyDiscountQuery(subtotalCents, loyaltyTier, promoCode));

        Assert.Equal(
            new LoyaltyDiscountQuote(subtotalCents, expectedDiscountCents, expectedTotalCents, loyaltyTier),
            quote);
    }
}
