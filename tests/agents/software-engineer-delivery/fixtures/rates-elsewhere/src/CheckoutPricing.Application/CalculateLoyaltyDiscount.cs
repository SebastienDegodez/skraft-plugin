using CheckoutPricing.Domain;
using LoyaltyRates;

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
        var discount = query.SubtotalCents * LoyaltyRateTable.PercentFor(query.LoyaltyTier.ToString()) / 100;
        return new(query.SubtotalCents, discount, query.SubtotalCents - discount, query.LoyaltyTier);
    }
}
