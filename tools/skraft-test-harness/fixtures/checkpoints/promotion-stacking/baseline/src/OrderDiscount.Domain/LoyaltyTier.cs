namespace OrderDiscount.Domain;

/// <summary>
/// Loyalty tier of a customer. Each tier carries the discount rate applied to
/// an order total at checkout.
/// </summary>
public enum LoyaltyTier
{
    Green,
    Gold,
    Platinum,
}

public static class LoyaltyTierExtensions
{
    /// <summary>Discount rate (0..1) granted by the tier.</summary>
    public static decimal DiscountRate(this LoyaltyTier tier) => tier switch
    {
        LoyaltyTier.Green => 0.00m,
        LoyaltyTier.Gold => 0.05m,
        LoyaltyTier.Platinum => 0.10m,
        _ => 0.00m,
    };
}
