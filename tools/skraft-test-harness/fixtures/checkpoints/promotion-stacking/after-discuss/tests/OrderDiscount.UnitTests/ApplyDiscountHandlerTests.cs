using FakeItEasy;
using OrderDiscount.Application;
using OrderDiscount.Domain;

namespace OrderDiscount.UnitTests;

/// <summary>
/// Application use case: <see cref="ApplyDiscountHandler"/> resolves the order
/// through the repository gateway and returns the discounted payable total.
/// </summary>
public sealed class ApplyDiscountHandlerTests
{
    [Test]
    public async Task ReturnsTheDiscountedTotalForTheResolvedOrder()
    {
        var orderId = Guid.NewGuid();
        var order = new Order(orderId);
        order.AddLine(new Money(200m));

        var repository = A.Fake<IOrderRepository>();
        A.CallTo(() => repository.FindById(orderId)).Returns(order);

        var handler = new ApplyDiscountHandler(repository);
        var result = handler.Handle(new ApplyDiscountRequest(orderId, LoyaltyTier.Gold));

        await Assert.That(result.OrderId).IsEqualTo(orderId);
        await Assert.That(result.PayableTotal).IsEqualTo(190m);
    }

    [Test]
    public async Task ThrowsWhenTheOrderDoesNotExist()
    {
        var repository = A.Fake<IOrderRepository>();
        A.CallTo(() => repository.FindById(A<Guid>._)).Returns(null);

        var handler = new ApplyDiscountHandler(repository);

        await Assert.That(() => handler.Handle(new ApplyDiscountRequest(Guid.NewGuid(), LoyaltyTier.Green)))
            .Throws<InvalidOperationException>();
    }
}
