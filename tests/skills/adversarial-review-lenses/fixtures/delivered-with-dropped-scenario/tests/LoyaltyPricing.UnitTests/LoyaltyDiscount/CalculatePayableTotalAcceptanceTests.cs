using LoyaltyPricing.Application;
using LoyaltyPricing.Domain;

namespace LoyaltyPricing.UnitTests.LoyaltyDiscount;

public sealed class CalculatePayableTotalAcceptanceTests
{
    [Fact]
    public void StandardMemberPaysTheFullSubtotal()
    {
        var useCase = new CalculatePayableTotal();

        var payableTotal = useCase.For(10_000, LoyaltyTier.Standard);

        Assert.Equal(10_000, payableTotal);
    }

    [Fact]
    public void GoldMemberPaysNinetyFivePercentOfTheSubtotal()
    {
        var useCase = new CalculatePayableTotal();

        var payableTotal = useCase.For(10_000, LoyaltyTier.Gold);

        Assert.Equal(9_500, payableTotal);
    }
}
