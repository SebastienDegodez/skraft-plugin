using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTest.Checkout;

[Trait("Scenario", "S14")]
public sealed class CheckoutQuoteAcceptanceTests
{
    [Theory]
    [InlineData(10_000, LoyaltyTier.Silver, "WELCOME5", false, 8_500, 0, 8_500)]
    [InlineData(5_000, LoyaltyTier.Bronze, null, false, 4_750, 490, 5_240)]
    [InlineData(20_000, LoyaltyTier.Platinum, "SUMMER10", true, 16_500, 0, 16_500)]
    [InlineData(2_000, LoyaltyTier.Gold, null, true, 2_000, 990, 2_990)]
    public void CheckoutQuoteAddsShippingToPayableTotal(int subtotalCents, LoyaltyTier loyaltyTier, string? promoCode, bool express, int expectedPayableCents, int expectedShippingCents, int expectedTotalCents)
    {
        var useCase = new QuoteCheckout();

        var quote = useCase.Handle(new QuoteCheckoutQuery(subtotalCents, loyaltyTier, promoCode, express));

        Assert.Equal(new CheckoutQuote(expectedPayableCents, expectedShippingCents, expectedTotalCents), quote);
    }
}
