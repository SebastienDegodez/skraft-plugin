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
        var discount = query.SubtotalCents * PercentFor(query.LoyaltyTier) / 100;
        return new(query.SubtotalCents, discount, query.SubtotalCents - discount, query.LoyaltyTier);
    }

    private static int PercentFor(LoyaltyTier tier) => tier switch
    {
        LoyaltyTier.Bronze => 5,
        LoyaltyTier.Silver => 10,
        LoyaltyTier.Gold => 15,
        _ => 0,
    };
}
