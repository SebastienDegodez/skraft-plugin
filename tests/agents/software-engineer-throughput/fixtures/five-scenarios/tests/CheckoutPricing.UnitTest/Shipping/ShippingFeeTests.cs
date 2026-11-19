using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.Shipping;

[Trait("Scenario", "S5")]
public sealed class CalculateShippingFeeAcceptanceTests
{
    [Theory]
    [InlineData(4_999, LoyaltyTier.Bronze, 490)]
    [InlineData(5_000, LoyaltyTier.Bronze, 0)]
    [InlineData(4_999, LoyaltyTier.Silver, 490)]
    [InlineData(1_000, LoyaltyTier.Gold, 0)]
    public void ShippingIsFreeFromFiftyEurosPayableAndAlwaysForGoldMembers(int payableTotalCents, LoyaltyTier loyaltyTier, int expectedFeeCents)
    {
        var useCase = new CalculateShippingFee();

        var fee = useCase.Handle(new CalculateShippingFeeQuery(payableTotalCents, loyaltyTier));

        Assert.Equal(expectedFeeCents, fee);
    }
}
