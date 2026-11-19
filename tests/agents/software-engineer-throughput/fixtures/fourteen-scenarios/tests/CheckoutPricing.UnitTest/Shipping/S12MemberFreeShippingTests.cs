using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.Shipping;

[Trait("Scenario", "S12")]
public sealed class MemberFreeShippingAcceptanceTests
{
    [Theory]
    [InlineData(1_000, LoyaltyTier.Gold, false, 0)]
    [InlineData(1_000, LoyaltyTier.Platinum, false, 0)]
    public void GoldAndPlatinumNeverPayStandardShipping(int payableTotalCents, LoyaltyTier loyaltyTier, bool express, int expectedFeeCents)
    {
        var useCase = new CalculateShippingFee();

        var fee = useCase.Handle(new CalculateShippingFeeQuery(payableTotalCents, loyaltyTier, express));

        Assert.Equal(expectedFeeCents, fee);
    }
}
