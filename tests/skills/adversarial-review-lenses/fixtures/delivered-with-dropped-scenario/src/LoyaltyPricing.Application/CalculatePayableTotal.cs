using LoyaltyPricing.Domain;

namespace LoyaltyPricing.Application;

public sealed class CalculatePayableTotal
{
    public int For(int subtotalCents, LoyaltyTier tier)
    {
        return LoyaltyDiscountPolicy.PayableCentsFor(subtotalCents, tier);
    }
}
