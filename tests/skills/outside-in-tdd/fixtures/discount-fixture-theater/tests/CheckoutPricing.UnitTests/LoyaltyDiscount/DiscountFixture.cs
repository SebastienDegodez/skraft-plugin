using CheckoutPricing.Domain;

namespace CheckoutPricing.UnitTests.LoyaltyDiscount;

public static class DiscountFixture
{
    public static int ExpectedTotalFrom(int actualCheckoutTotal, LoyaltyTier loyaltyTier)
    {
        var baseRate = loyaltyTier switch
        {
            LoyaltyTier.Green => 5,
            LoyaltyTier.Gold => 7,
            LoyaltyTier.Platinum => 9,
            _ => 0,
        };

        var bonus = actualCheckoutTotal >= 20_000 ? 3 : actualCheckoutTotal >= 5_000 ? 1 : 0;
        var effectiveRate = Math.Min(baseRate + bonus, 10);

        return actualCheckoutTotal - (actualCheckoutTotal * effectiveRate / 100);
    }
}
