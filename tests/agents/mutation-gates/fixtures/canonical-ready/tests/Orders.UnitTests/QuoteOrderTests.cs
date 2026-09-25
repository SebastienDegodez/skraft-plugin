using Orders.Application;

namespace Orders.UnitTests;

public static class QuoteOrderTests
{
    public static bool DiscountBoundaryIsCovered() => new QuoteOrder().Execute(100m) == 90m;
}