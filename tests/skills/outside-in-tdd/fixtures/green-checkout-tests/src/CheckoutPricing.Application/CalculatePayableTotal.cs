using CheckoutPricing.Domain;

namespace CheckoutPricing.Application;

public sealed class CalculatePayableTotal
{
    private readonly LoyaltyDiscountPolicy _loyaltyDiscountPolicy;

    public CalculatePayableTotal(LoyaltyDiscountPolicy loyaltyDiscountPolicy)
    {
        _loyaltyDiscountPolicy = loyaltyDiscountPolicy;
    }

    public int For(int subtotalCents, LoyaltyTier loyaltyTier)
    {
        return _loyaltyDiscountPolicy.PayableTotalCents(subtotalCents, loyaltyTier);
    }
}
