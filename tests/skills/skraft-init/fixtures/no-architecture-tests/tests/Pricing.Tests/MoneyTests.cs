namespace Pricing.Tests;

public class MoneyTests
{
    [Fact]
    public void A_money_keeps_its_currency() => Assert.Equal("EUR", new Money(10m, "EUR").Currency);
}
