using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.Shipping;

[Trait("Scenario", "S13")]
public sealed class ExpressShippingAcceptanceTests
{
    [Theory]
    [InlineData(10_000, LoyaltyTier.Bronze, true, 990)]
    [InlineData(1_000, LoyaltyTier.Gold, true, 990)]
    [InlineData(1_000, LoyaltyTier.Platinum, true, 0)]
    public void ExpressShippingCostsNineNinetyFreeForPlatinumOnly(int payableTotalCents, LoyaltyTier loyaltyTier, bool express, int expectedFeeCents)
    {
        var useCase = new CalculateShippingFee();

        var fee = useCase.Handle(new CalculateShippingFeeQuery(payableTotalCents, loyaltyTier, express));

        Assert.Equal(expectedFeeCents, fee);
    }
}
