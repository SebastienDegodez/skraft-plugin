using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTests.LoyaltyDiscount;

public sealed class CalculatePayableTotalAcceptanceTests
{
    [Fact]
    public void GoldCustomersPayNinetyFivePercentOfSubtotal()
    {
        var useCase = new CalculatePayableTotal();
        var actualCheckoutTotal = useCase.For(10_000, LoyaltyTier.Gold);

        Assert.Equal(9_500, DiscountFixture.ExpectedGoldTotalFrom(actualCheckoutTotal));
    }
}
