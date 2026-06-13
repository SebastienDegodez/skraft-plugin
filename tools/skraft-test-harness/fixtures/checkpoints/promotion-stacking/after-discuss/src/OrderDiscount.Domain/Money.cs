namespace OrderDiscount.Domain;

/// <summary>
/// Money value object. Immutable, non-negative, single-currency (the sample
/// keeps one implicit currency for brevity).
/// </summary>
public readonly record struct Money
{
    public decimal Amount { get; }

    public Money(decimal amount)
    {
        if (amount < 0)
            throw new ArgumentOutOfRangeException(nameof(amount), "Money cannot be negative.");
        Amount = amount;
    }

    public static Money Zero => new(0m);

    public Money Add(Money other) => new(Amount + other.Amount);

    public Money MultiplyBy(decimal factor) => new(Amount * factor);

    public override string ToString() => Amount.ToString("0.00");
}
