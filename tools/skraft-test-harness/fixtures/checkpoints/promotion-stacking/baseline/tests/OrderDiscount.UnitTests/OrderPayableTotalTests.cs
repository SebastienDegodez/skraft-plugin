using OrderDiscount.Domain;

namespace OrderDiscount.UnitTests;

/// <summary>
/// Domain rule: the payable total reflects the loyalty-tier discount applied to
/// the order subtotal. This is the seam the promotion-stacking feature extends.
/// </summary>
public sealed class OrderPayableTotalTests
{
    [Test]
    public async Task GreenTierPaysTheFullSubtotal()
    {
        var order = new Order(Guid.NewGuid());
        order.AddLine(new Money(60m));
        order.AddLine(new Money(40m));

        var payable = order.PayableTotal(LoyaltyTier.Green);

        await Assert.That(payable.Amount).IsEqualTo(100m);
    }

    [Test]
    public async Task GoldTierGetsAFivePercentDiscount()
    {
        var order = new Order(Guid.NewGuid());
        order.AddLine(new Money(100m));

        var payable = order.PayableTotal(LoyaltyTier.Gold);

        await Assert.That(payable.Amount).IsEqualTo(95m);
    }

    [Test]
    public async Task PlatinumTierGetsATenPercentDiscount()
    {
        var order = new Order(Guid.NewGuid());
        order.AddLine(new Money(100m));

        var payable = order.PayableTotal(LoyaltyTier.Platinum);

        await Assert.That(payable.Amount).IsEqualTo(90m);
    }
}
