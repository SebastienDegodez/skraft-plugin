namespace Loyalty;

public sealed record BasketLine(decimal UnitPrice, int Quantity);

public sealed class PriceCalculator
{
    private const decimal MemberDiscount = 0.10m;

    public decimal PriceOf(IReadOnlyList<BasketLine> lines, bool isMember)
    {
        var total = lines.Sum(line => line.UnitPrice * line.Quantity);
        return isMember ? decimal.Round(total * (1 - MemberDiscount), 2) : total;
    }
}
