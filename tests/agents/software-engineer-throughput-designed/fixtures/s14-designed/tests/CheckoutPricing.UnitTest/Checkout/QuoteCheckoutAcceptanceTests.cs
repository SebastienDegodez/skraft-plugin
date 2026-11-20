using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.Checkout;

public sealed class QuoteCheckoutAcceptanceTests
{
    // S14 - The checkout quote adds shipping to the payable total
    [Theory]
    [Trait("Scenario", "S14")]
    [InlineData(10_000, LoyaltyTier.Silver, "WELCOME5", false, 8_500, 0, 8_500)]
    [InlineData(5_000, LoyaltyTier.Bronze, null, false, 4_750, 490, 5_240)]
    [InlineData(20_000, LoyaltyTier.Platinum, "SUMMER10", true, 16_500, 0, 16_500)]
    [InlineData(2_000, LoyaltyTier.Gold, null, true, 2_000, 990, 2_990)]
    public void CheckoutQuoteAddsShippingToThePayableTotal(
        int subtotalCents, LoyaltyTier tier, string? promoCode, bool express, int payableCents, int shippingCents, int totalCents) =>
        Assert.Equal(
            new CheckoutQuote(payableCents, shippingCents, totalCents),
            new QuoteCheckout().Handle(new QuoteCheckoutQuery(subtotalCents, tier, promoCode, express)));
}
