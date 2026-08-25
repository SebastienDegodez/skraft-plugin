using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.Features.LoyaltyDiscount;

public sealed class LoyaltyDiscountAcceptanceTests
{
    private readonly CalculateLoyaltyDiscount _handler = new();

    // AC-1 / AC-2 / AC-3 — Returning customer receives the tier reduction on a standard basket
    [Theory]
    [InlineData(LoyaltyTier.Bronze, 10000, 9500)]
    [InlineData(LoyaltyTier.Silver, 10000, 9000)]
    [InlineData(LoyaltyTier.Gold,   10000, 8500)]
    public void WhenBasketIsPriced_TierReductionIsApplied(
        LoyaltyTier tier, int subtotalCents, int expectedTotalCents)
    {
        var query = new CalculateLoyaltyDiscountQuery(subtotalCents, tier);

        var quote = _handler.Handle(query);

        Assert.Equal(expectedTotalCents, quote.TotalCents);
    }

    // AC-4 — Bronze reduction on a subtotal smaller than one discountable cent rounds in the customer's favour
    [Fact]
    public void WhenBronzeSubtotalIsTooSmallToDiscount_CustomerIsChargedFullSubtotal()
    {
        var query = new CalculateLoyaltyDiscountQuery(SubtotalCents: 7, LoyaltyTier: LoyaltyTier.Bronze);

        var quote = _handler.Handle(query);

        Assert.Equal(7, quote.TotalCents);
    }

    // PENDING — Platinum tier reduction not decided by the business.
    // Unblock this test only after DISCUSS provides an agreed reduction value.
    // Do NOT invent a value.
    [Fact(Skip = "PENDING - Platinum tier reduction not yet decided by the business")]
    public void WhenPlatinumBasketIsPriced_CustomerIsChargedAtAgreedRate()
    {
        Assert.Fail("Scenario is pending a business decision - do not implement until DISCUSS resolves the Platinum rate.");
    }
}
