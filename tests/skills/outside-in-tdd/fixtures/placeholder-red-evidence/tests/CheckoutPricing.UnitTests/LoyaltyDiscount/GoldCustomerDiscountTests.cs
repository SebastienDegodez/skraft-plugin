using CheckoutPricing.Application;

namespace CheckoutPricing.UnitTests.LoyaltyDiscount;

public sealed class GoldCustomerDiscountTests
{
    [Fact]
    public void GoldCustomerPaysTheApprovedShareOfTheSubtotal()
    {
        var useCase = new CalculatePayableTotal();
        _ = useCase.ForGoldCustomer(10_000);

        Assert.Fail("discount not implemented yet");
    }
}
