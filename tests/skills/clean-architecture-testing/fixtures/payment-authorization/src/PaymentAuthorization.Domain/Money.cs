namespace PaymentAuthorization.Domain;

/// <summary>An amount and the currency it is expressed in.</summary>
public readonly record struct Money
{
    public Money(decimal amount, string currency)
    {
        if (amount <= 0) throw new ArgumentOutOfRangeException(nameof(amount), "An amount must be positive.");
        if (string.IsNullOrWhiteSpace(currency)) throw new ArgumentException("A currency is required.", nameof(currency));

        Amount = amount;
        Currency = currency.ToUpperInvariant();
    }

    public decimal Amount { get; }

    public string Currency { get; }
}
