namespace CheckoutPricing.UnitTests.LoyaltyDiscount;

public static class DiscountFixture
{
    public static int ExpectedGoldTotalFrom(int actualCheckoutTotal)
    {
        return (int)Math.Floor(actualCheckoutTotal * 0.95m);
    }
}
