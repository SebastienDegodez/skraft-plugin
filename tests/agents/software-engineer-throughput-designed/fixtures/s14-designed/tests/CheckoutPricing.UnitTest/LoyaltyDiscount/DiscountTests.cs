using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

public sealed class CalculateLoyaltyDiscountAcceptanceTests
{
    [Theory]
    [Trait("Scenario", "S1")]
    [InlineData(LoyaltyTier.Bronze, 500, 9_500)]
    [InlineData(LoyaltyTier.Silver, 1_000, 9_000)]
    [InlineData(LoyaltyTier.Gold, 1_500, 8_500)]
    public void MemberReceivesApprovedDiscountOnCartSubtotal(
        LoyaltyTier loyaltyTier,
        int expectedDiscountCents,
        int expectedTotalCents)
    {
        var useCase = new CalculateLoyaltyDiscount();

        var quote = useCase.Handle(new CalculateLoyaltyDiscountQuery(10_000, loyaltyTier));

        Assert.Equal(
            new LoyaltyDiscountQuote(10_000, expectedDiscountCents, expectedTotalCents, loyaltyTier),
            quote);
    }

    // S2 - The loyalty discount never exceeds 20.00 EUR
    [Theory]
    [Trait("Scenario", "S2")]
    [InlineData(20_000, LoyaltyTier.Gold, 2_000, 18_000)]
    [InlineData(30_000, LoyaltyTier.Silver, 2_000, 28_000)]
    [InlineData(12_000, LoyaltyTier.Gold, 1_800, 10_200)]
    public void LoyaltyDiscountNeverExceedsTwentyEuros(int subtotalCents, LoyaltyTier tier, int discountCents, int totalCents) =>
        AssertQuote(subtotalCents, tier, null, discountCents, totalCents);

    // S3 - No loyalty discount under a 30.00 EUR subtotal
    [Theory]
    [Trait("Scenario", "S3")]
    [InlineData(2_999, 0, 2_999)]
    [InlineData(3_000, 450, 2_550)]
    public void NoLoyaltyDiscountUnderThirtyEuros(int subtotalCents, int discountCents, int totalCents) =>
        AssertQuote(subtotalCents, LoyaltyTier.Gold, null, discountCents, totalCents);

    // S9 - Platinum members receive a 20 % loyalty discount
    [Theory]
    [Trait("Scenario", "S9")]
    [InlineData(10_000, 2_000, 8_000)]
    [InlineData(5_000, 1_000, 4_000)]
    [InlineData(20_000, 2_000, 18_000)]
    public void PlatinumMembersReceiveTwentyPercent(int subtotalCents, int discountCents, int totalCents) =>
        AssertQuote(subtotalCents, LoyaltyTier.Platinum, null, discountCents, totalCents);

    // S10 - The discount never exceeds the subtotal
    [Theory]
    [Trait("Scenario", "S10")]
    [InlineData(400, LoyaltyTier.Bronze, 400)]
    [InlineData(300, LoyaltyTier.Gold, 300)]
    public void DiscountNeverExceedsTheSubtotal(int subtotalCents, LoyaltyTier tier, int discountCents) =>
        AssertQuote(subtotalCents, tier, "WELCOME5", discountCents, 0);

    internal static void AssertQuote(int subtotalCents, LoyaltyTier tier, string? promoCode, int discountCents, int totalCents) =>
        Assert.Equal(
            new LoyaltyDiscountQuote(subtotalCents, discountCents, totalCents, tier),
            new CalculateLoyaltyDiscount().Handle(new CalculateLoyaltyDiscountQuery(subtotalCents, tier, promoCode)));
}
