namespace Loyalty.Tests;

public sealed class PriceCalculatorTests
{
    [Fact]
    public void A_basket_without_membership_pays_the_sum_of_its_lines()
    {
        var price = new PriceCalculator().PriceOf([new BasketLine(4m, 2), new BasketLine(2m, 1)], isMember: false);

        Assert.Equal(10m, price);
    }

    [Fact]
    public void An_active_member_gets_ten_percent_off()
    {
        var price = new PriceCalculator().PriceOf([new BasketLine(5m, 2)], isMember: true);

        Assert.Equal(9m, price);
    }
}
