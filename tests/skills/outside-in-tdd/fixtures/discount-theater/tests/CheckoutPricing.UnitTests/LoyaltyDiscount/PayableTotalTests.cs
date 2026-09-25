using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTests.LoyaltyDiscount;

public sealed class CalculatePayableTotalAcceptanceTests
{
    [Theory]
    [InlineData(LoyaltyTier.Green, 10_000, 9_400)]
    [InlineData(LoyaltyTier.Gold, 10_000, 9_200)]
    [InlineData(LoyaltyTier.Platinum, 20_000, 18_000)]
    public void CustomersPayTheApprovedLoyaltyTotal(LoyaltyTier loyaltyTier, int subtotalCents, int expectedPayableCents)
    {
        var useCase = new CalculatePayableTotal();
        var actualCheckoutTotal = useCase.For(subtotalCents, loyaltyTier);

        Assert.Equal(expectedPayableCents, DiscountFixture.ExpectedTotalFrom(actualCheckoutTotal, loyaltyTier));
    }
}
