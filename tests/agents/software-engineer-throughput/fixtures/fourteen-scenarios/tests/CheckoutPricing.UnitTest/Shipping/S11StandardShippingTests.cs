using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.Shipping;

[Trait("Scenario", "S11")]
public sealed class StandardShippingAcceptanceTests
{
    [Theory]
    [InlineData(4_999, LoyaltyTier.Bronze, false, 490)]
    [InlineData(5_000, LoyaltyTier.Bronze, false, 0)]
    [InlineData(4_999, LoyaltyTier.Silver, false, 490)]
    public void StandardShippingIsFreeFromFiftyEurosPayable(int payableTotalCents, LoyaltyTier loyaltyTier, bool express, int expectedFeeCents)
    {
        var useCase = new CalculateShippingFee();

        var fee = useCase.Handle(new CalculateShippingFeeQuery(payableTotalCents, loyaltyTier, express));

        Assert.Equal(expectedFeeCents, fee);
    }
}
