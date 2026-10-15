using CheckoutPricing.Domain;
using Xunit;

namespace CheckoutPricing.UnitTests;

public class LoyaltyDiscountTests
{
    [Theory]
    [InlineData(LoyaltyTier.Bronze, 10000, 9500)]
    [InlineData(LoyaltyTier.Silver, 10000, 9000)]
    [InlineData(LoyaltyTier.Gold, 10000, 8500)]
    [InlineData(LoyaltyTier.Bronze, 7, 7)]
    public void Charges_the_tier_reduced_total(LoyaltyTier tier, long subtotal, long charged) =>
        Assert.Equal(charged, LoyaltyDiscount.Apply(tier, subtotal));
}
