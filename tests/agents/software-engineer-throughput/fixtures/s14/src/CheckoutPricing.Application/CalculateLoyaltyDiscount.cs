using CheckoutPricing.Domain;

namespace CheckoutPricing.Application;

public sealed record CalculateLoyaltyDiscountQuery(int SubtotalCents, LoyaltyTier LoyaltyTier);

public sealed record LoyaltyDiscountQuote(
    int SubtotalCents,
    int DiscountCents,
    int TotalCents,
    LoyaltyTier LoyaltyTier);

public sealed class CalculateLoyaltyDiscount
{
    public LoyaltyDiscountQuote Handle(CalculateLoyaltyDiscountQuery query) =>
        new(query.SubtotalCents, 0, query.SubtotalCents, query.LoyaltyTier);
}