namespace LoyaltyPricing.Domain;

public enum LoyaltyTier
{
    Standard,
    Gold
}

public static class LoyaltyDiscountPolicy
{
    private const int GoldDiscountPercent = 5;

    public static int PayableCentsFor(int subtotalCents, LoyaltyTier tier)
    {
        if (tier != LoyaltyTier.Gold)
        {
            return subtotalCents;
        }

        var discountCents = subtotalCents * GoldDiscountPercent / 100;

        return subtotalCents - discountCents;
    }
}
