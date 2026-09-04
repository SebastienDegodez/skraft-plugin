using Orders.Domain;

namespace Orders.Application;

public sealed class QuoteOrder
{
    public decimal Execute(decimal subtotal) => DiscountPolicy.Apply(subtotal);
}