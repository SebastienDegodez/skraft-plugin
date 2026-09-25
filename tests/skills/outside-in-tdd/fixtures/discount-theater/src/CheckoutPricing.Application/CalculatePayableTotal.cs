using CheckoutPricing.Domain;

namespace CheckoutPricing.Application;

public sealed class CalculatePayableTotal
{
    public int For(int subtotalCents, LoyaltyTier loyaltyTier)
    {
        _ = loyaltyTier;
        return subtotalCents;
    }
}
