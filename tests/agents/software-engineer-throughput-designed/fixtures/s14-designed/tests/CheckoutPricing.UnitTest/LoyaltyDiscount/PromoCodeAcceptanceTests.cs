using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.LoyaltyDiscount;

public sealed class PromoCodeAcceptanceTests
{
    // S4 - The WELCOME5 promo code takes 5.00 EUR off after the loyalty discount
    [Theory]
    [Trait("Scenario", "S4")]
    [InlineData(10_000, LoyaltyTier.Silver, 1_500, 8_500)]
    [InlineData(2_000, LoyaltyTier.Bronze, 500, 1_500)]
    public void WelcomeFiveTakesFiveEurosAfterTheLoyaltyDiscount(int subtotalCents, LoyaltyTier tier, int discountCents, int totalCents) =>
        CalculateLoyaltyDiscountAcceptanceTests.AssertQuote(subtotalCents, tier, "WELCOME5", discountCents, totalCents);

    // S5 - The cap applies to the loyalty discount only, never to WELCOME5
    [Theory]
    [Trait("Scenario", "S5")]
    [InlineData(20_000, LoyaltyTier.Gold, 2_500, 17_500)]
    [InlineData(30_000, LoyaltyTier.Silver, 2_500, 27_500)]
    public void CapAppliesToTheLoyaltyDiscountOnly(int subtotalCents, LoyaltyTier tier, int discountCents, int totalCents) =>
        CalculateLoyaltyDiscountAcceptanceTests.AssertQuote(subtotalCents, tier, "WELCOME5", discountCents, totalCents);

    // S6 - Promo codes ignore case
    [Theory]
    [Trait("Scenario", "S6")]
    [InlineData("welcome5")]
    [InlineData("Welcome5")]
    public void PromoCodesIgnoreCase(string code) =>
        Assert.Equal(
            1_500,
            new CalculateLoyaltyDiscount().Handle(new CalculateLoyaltyDiscountQuery(10_000, LoyaltyTier.Silver, code)).DiscountCents);

    // S7 - The SUMMER10 promo code takes 10 % off what is left, at most 15.00 EUR
    [Theory]
    [Trait("Scenario", "S7")]
    [InlineData(10_000, LoyaltyTier.Silver, 1_900, 8_100)]
    [InlineData(30_000, LoyaltyTier.Bronze, 3_000, 27_000)]
    [InlineData(2_000, LoyaltyTier.Gold, 200, 1_800)]
    public void SummerTenTakesTenPercentOfWhatIsLeft(int subtotalCents, LoyaltyTier tier, int discountCents, int totalCents) =>
        CalculateLoyaltyDiscountAcceptanceTests.AssertQuote(subtotalCents, tier, "SUMMER10", discountCents, totalCents);

    // S8 - An unknown promo code is ignored
    [Fact]
    [Trait("Scenario", "S8")]
    public void UnknownPromoCodeIsIgnored() =>
        CalculateLoyaltyDiscountAcceptanceTests.AssertQuote(10_000, LoyaltyTier.Silver, "SPRING", 1_000, 9_000);
}
