namespace CheckoutPricing.Domain;

public sealed class LoyaltyDiscountPolicy
{
    private const int GoldDiscountPercent = 5;

    public int PayableTotalCents(int subtotalCents, LoyaltyTier loyaltyTier)
    {
        _ = loyaltyTier;

        return subtotalCents - (subtotalCents * GoldDiscountPercent / 100);
    }
}
