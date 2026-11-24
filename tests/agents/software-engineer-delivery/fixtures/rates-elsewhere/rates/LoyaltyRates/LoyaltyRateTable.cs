namespace LoyaltyRates;

public static class LoyaltyRateTable
{
    public static int PercentFor(string tier) => tier switch
    {
        "Bronze" => 5,
        "Silver" => 10,
        _ => 0,
    };
}
