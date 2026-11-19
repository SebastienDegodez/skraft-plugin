using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

[Trait("Scenario", "S3")]
public sealed class CalculateLoyaltyDiscountMinimumSubtotalAcceptanceTests
{
    [Theory]
    [InlineData(2_999, LoyaltyTier.Gold, null, 0, 2_999)]
    [InlineData(3_000, LoyaltyTier.Gold, null, 450, 2_550)]
    public void NoLoyaltyDiscountUnderThirtyEurosSubtotal(int subtotalCents, LoyaltyTier loyaltyTier, string? promoCode, int expectedDiscountCents, int expectedTotalCents)
    {
        var useCase = new CalculateLoyaltyDiscount();

        var quote = useCase.Handle(new CalculateLoyaltyDiscountQuery(subtotalCents, loyaltyTier, promoCode));

        Assert.Equal(
            new LoyaltyDiscountQuote(subtotalCents, expectedDiscountCents, expectedTotalCents, loyaltyTier),
            quote);
    }
}
