using CheckoutPricing.Domain;
using Xunit;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

public class LoyaltyDiscountPolicyTests
{
    [Theory]
    [InlineData(LoyaltyTier.Bronze, 10_000)]
    [InlineData(LoyaltyTier.Silver, 10_000)]
    [InlineData(LoyaltyTier.Gold, 10_000)]
    [InlineData(LoyaltyTier.Bronze, 7)]
    public void Discount_matches_the_tier_rate(LoyaltyTier tier, int subtotalCents)
    {
        var expected = subtotalCents * LoyaltyDiscountPolicy.RateFor(tier) / 100;

        var actual = LoyaltyDiscountPolicy.DiscountFor(tier, subtotalCents);

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Quote_is_produced()
    {
        var handler = new CheckoutPricing.Application.CalculateLoyaltyDiscount();

        var quote = handler.Handle(new CheckoutPricing.Application.CalculateLoyaltyDiscountQuery(10_000, LoyaltyTier.Gold));

        Assert.NotNull(quote);
    }
}
