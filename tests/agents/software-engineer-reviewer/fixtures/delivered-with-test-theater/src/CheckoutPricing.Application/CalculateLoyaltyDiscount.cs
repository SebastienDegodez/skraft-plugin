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
    public LoyaltyDiscountQuote Handle(CalculateLoyaltyDiscountQuery query)
    {
        var discount = LoyaltyDiscountPolicy.DiscountFor(query.LoyaltyTier, query.SubtotalCents);
        return new LoyaltyDiscountQuote(
            query.SubtotalCents,
            discount,
            query.SubtotalCents - discount,
            query.LoyaltyTier);
    }
}
