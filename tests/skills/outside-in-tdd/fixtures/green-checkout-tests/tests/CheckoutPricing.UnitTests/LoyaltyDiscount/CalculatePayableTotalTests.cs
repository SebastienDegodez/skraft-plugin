using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTests.LoyaltyDiscount;

public sealed class CalculatePayableTotalTests
{
    [Fact]
    public void For_SubtotalCents10000_LoyaltyTierGold_ReturnsInt9500()
    {
        var subtotalCents = 10_000;
        var loyaltyTier = LoyaltyTier.Gold;
        var loyaltyDiscountPolicy = new LoyaltyDiscountPolicy();
        var useCase = new CalculatePayableTotal(loyaltyDiscountPolicy);
        var expectedPayableTotalCents = 9_500;
        var actualPayableTotalCents = useCase.For(subtotalCents, loyaltyTier);

        Assert.Equal(expectedPayableTotalCents, actualPayableTotalCents);
    }

    [Fact]
    public void For_SubtotalCents20000_LoyaltyTierGold_ReturnsInt19000()
    {
        var subtotalCents = 20_000;
        var loyaltyTier = LoyaltyTier.Gold;
        var loyaltyDiscountPolicy = new LoyaltyDiscountPolicy();
        var useCase = new CalculatePayableTotal(loyaltyDiscountPolicy);
        var expectedPayableTotalCents = 19_000;
        var actualPayableTotalCents = useCase.For(subtotalCents, loyaltyTier);

        Assert.Equal(expectedPayableTotalCents, actualPayableTotalCents);
    }

    [Fact]
    public void For_SubtotalCents5000_LoyaltyTierGold_ReturnsInt4750()
    {
        var subtotalCents = 5_000;
        var loyaltyTier = LoyaltyTier.Gold;
        var loyaltyDiscountPolicy = new LoyaltyDiscountPolicy();
        var useCase = new CalculatePayableTotal(loyaltyDiscountPolicy);
        var expectedPayableTotalCents = 4_750;
        var actualPayableTotalCents = useCase.For(subtotalCents, loyaltyTier);

        Assert.Equal(expectedPayableTotalCents, actualPayableTotalCents);
    }

    [Fact]
    public void For_SubtotalCents0_LoyaltyTierGold_ReturnsInt0()
    {
        var subtotalCents = 0;
        var loyaltyTier = LoyaltyTier.Gold;
        var loyaltyDiscountPolicy = new LoyaltyDiscountPolicy();
        var useCase = new CalculatePayableTotal(loyaltyDiscountPolicy);
        var expectedPayableTotalCents = 0;
        var actualPayableTotalCents = useCase.For(subtotalCents, loyaltyTier);

        Assert.Equal(expectedPayableTotalCents, actualPayableTotalCents);
    }
}
