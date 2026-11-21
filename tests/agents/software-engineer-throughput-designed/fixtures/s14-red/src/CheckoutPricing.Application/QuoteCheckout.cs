using CheckoutPricing.Domain;

namespace CheckoutPricing.Application;

public sealed record QuoteCheckoutQuery(int SubtotalCents, LoyaltyTier LoyaltyTier, string? PromoCode, bool Express);

public sealed record CheckoutQuote(int PayableCents, int ShippingCents, int TotalCents);

public sealed class QuoteCheckout
{
    public CheckoutQuote Handle(QuoteCheckoutQuery query) => new(0, 0, 0);
}
