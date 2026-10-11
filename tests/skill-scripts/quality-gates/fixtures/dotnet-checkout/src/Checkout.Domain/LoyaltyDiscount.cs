namespace Checkout.Domain;

public static class LoyaltyDiscount
{
    public static decimal Apply(string tier, decimal amount)
    {
        if (amount < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(amount));
        }

        var rate = tier switch
        {
            "gold" => 0.10m,
            "silver" => 0.05m,
            _ => 0m,
        };
        return amount - (amount * rate);
    }
}
