using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

[Trait("Scenario", "S10")]
public sealed class DiscountBoundedBySubtotalAcceptanceTests
{
    [Theory]
    [InlineData(400, LoyaltyTier.Bronze, "WELCOME5", 400, 0)]
    [InlineData(300, LoyaltyTier.Gold, "WELCOME5", 300, 0)]
    public void DiscountNeverExceedsSubtotal(int subtotalCents, LoyaltyTier loyaltyTier, string? promoCode, int expectedDiscountCents, int expectedTotalCents)
    {
        var useCase = new CalculateLoyaltyDiscount();

        var quote = useCase.Handle(new CalculateLoyaltyDiscountQuery(subtotalCents, loyaltyTier, promoCode));

        Assert.Equal(
            new LoyaltyDiscountQuote(subtotalCents, expectedDiscountCents, expectedTotalCents, loyaltyTier),
            quote);
    }
}
