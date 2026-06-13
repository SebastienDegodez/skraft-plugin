namespace OrderDiscount.Domain;

/// <summary>
/// An order is the aggregate root for checkout. It owns its line totals and
/// knows how to compute the payable amount for a given loyalty tier — the
/// discount rule lives in the domain, not in a controller.
/// </summary>
public sealed class Order
{
    private readonly List<Money> _lines = [];

    public Order(Guid id) => Id = id;

    public Guid Id { get; }

    public IReadOnlyList<Money> Lines => _lines;

    public void AddLine(Money price) => _lines.Add(price);

    public Money Subtotal() => _lines.Aggregate(Money.Zero, (total, line) => total.Add(line));

    /// <summary>Payable total after applying the tier's discount to the subtotal.</summary>
    public Money PayableTotal(LoyaltyTier tier)
    {
        var subtotal = Subtotal();
        var discount = subtotal.MultiplyBy(tier.DiscountRate());
        return new Money(subtotal.Amount - discount.Amount);
    }
}
