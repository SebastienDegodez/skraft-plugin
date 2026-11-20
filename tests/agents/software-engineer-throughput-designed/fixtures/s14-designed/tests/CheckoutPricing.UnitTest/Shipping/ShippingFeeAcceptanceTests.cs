using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.Shipping;

public sealed class ShippingFeeAcceptanceTests
{
    // S11 - Standard shipping is free from 50.00 EUR payable
    [Theory]
    [Trait("Scenario", "S11")]
    [InlineData(4_999, LoyaltyTier.Bronze, 490)]
    [InlineData(5_000, LoyaltyTier.Bronze, 0)]
    [InlineData(4_999, LoyaltyTier.Silver, 490)]
    public void StandardShippingIsFreeFromFiftyEuros(int payableCents, LoyaltyTier tier, int feeCents) =>
        Assert.Equal(feeCents, new CalculateShippingFee().Handle(new CalculateShippingFeeQuery(payableCents, tier)));

    // S12 - Gold and Platinum members never pay standard shipping
    [Theory]
    [Trait("Scenario", "S12")]
    [InlineData(LoyaltyTier.Gold)]
    [InlineData(LoyaltyTier.Platinum)]
    public void GoldAndPlatinumNeverPayStandardShipping(LoyaltyTier tier) =>
        Assert.Equal(0, new CalculateShippingFee().Handle(new CalculateShippingFeeQuery(1_000, tier)));

    // S13 - Express shipping costs 9.90 EUR, free for Platinum members only
    [Theory]
    [Trait("Scenario", "S13")]
    [InlineData(10_000, LoyaltyTier.Bronze, 990)]
    [InlineData(1_000, LoyaltyTier.Gold, 990)]
    [InlineData(1_000, LoyaltyTier.Platinum, 0)]
    public void ExpressShippingCostsNineNinety(int payableCents, LoyaltyTier tier, int feeCents) =>
        Assert.Equal(feeCents, new CalculateShippingFee().Handle(new CalculateShippingFeeQuery(payableCents, tier, Express: true)));
}
