namespace CheckoutPricing.Domain;

public enum LoyaltyTier
{
    Bronze,
    Silver,
    Gold
}

public static class LoyaltyDiscountPolicy
{
    public static int RateFor(LoyaltyTier tier) => tier switch
    {
        LoyaltyTier.Bronze => 5,
        LoyaltyTier.Silver => 10,
        LoyaltyTier.Gold => 15,
        _ => 0
    };

    public static int DiscountFor(LoyaltyTier tier, int subtotalCents) =>
        subtotalCents * RateFor(tier) / 100;
}
