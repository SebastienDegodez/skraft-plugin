namespace CheckoutPricing.Domain;

public static class LoyaltyDiscount
{
    public static long Apply(LoyaltyTier tier, long subtotalCents)
    {
        var percent = tier switch
        {
            LoyaltyTier.Bronze => 5,
            LoyaltyTier.Silver => 10,
            LoyaltyTier.Gold => 15,
            _ => 0,
        };
        var reduction = subtotalCents * percent / 100;
        return subtotalCents - reduction;
    }
}
