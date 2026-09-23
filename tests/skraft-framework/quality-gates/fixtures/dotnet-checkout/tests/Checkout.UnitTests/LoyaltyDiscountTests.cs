using Checkout.Domain;

namespace Checkout.UnitTests;

public class LoyaltyDiscountTests
{
    [Fact]
    public void Gold_customers_get_ten_percent_off() =>
        Assert.Equal(90m, LoyaltyDiscount.Apply("gold", 100m));

    [Fact]
    public void Silver_customers_get_five_percent_off() =>
        Assert.Equal(95m, LoyaltyDiscount.Apply("silver", 100m));

    [Fact]
    public void Other_customers_pay_full_price() =>
        Assert.Equal(100m, LoyaltyDiscount.Apply("standard", 100m));

    [Fact]
    public void An_empty_order_costs_nothing() =>
        Assert.Equal(0m, LoyaltyDiscount.Apply("gold", 0m));

    [Fact]
    public void A_negative_amount_is_refused() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => LoyaltyDiscount.Apply("gold", -1m));
}
