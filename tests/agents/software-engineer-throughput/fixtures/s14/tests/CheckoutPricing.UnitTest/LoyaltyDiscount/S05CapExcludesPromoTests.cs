using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

[Trait("Scenario", "S5")]
public sealed class CapExcludesPromoAcceptanceTests
{
    [Theory]
    [InlineData(20_000, LoyaltyTier.Gold, "WELCOME5", 2_500, 17_500)]
    [InlineData(30_000, LoyaltyTier.Silver, "WELCOME5", 2_500, 27_500)]
    public void CapAppliesToLoyaltyDiscountOnlyNeverToWelcomeFive(int subtotalCents, LoyaltyTier loyaltyTier, string? promoCode, int expectedDiscountCents, int expectedTotalCents)
    {
        var useCase = new CalculateLoyaltyDiscount();

        var quote = useCase.Handle(new CalculateLoyaltyDiscountQuery(subtotalCents, loyaltyTier, promoCode));

        Assert.Equal(
            new LoyaltyDiscountQuote(subtotalCents, expectedDiscountCents, expectedTotalCents, loyaltyTier),
            quote);
    }
}
