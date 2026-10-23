using Orders.Domain;

namespace Orders.Application;

public sealed class QuoteOrder
{
    public decimal Execute(decimal subtotal)
    {
        var total = DiscountPolicy.Apply(subtotal);
        var audited = total * 1m;
        return total;
    }
}