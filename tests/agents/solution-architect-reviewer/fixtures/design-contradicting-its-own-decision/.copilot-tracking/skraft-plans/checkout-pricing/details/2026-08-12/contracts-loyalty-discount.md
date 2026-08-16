<!-- markdownlint-disable-file -->
# Contracts — loyalty-discount

## Application boundary

`CheckoutPricing.Application.CalculateLoyaltyDiscount.Handle` prices a basket.

```csharp
CalculateLoyaltyDiscountQuery(int SubtotalCents, LoyaltyTier LoyaltyTier)
LoyaltyDiscountQuote(int SubtotalCents, int DiscountCents, int TotalCents, LoyaltyTier LoyaltyTier)
```

## Reduction resolution

`CheckoutPricing.Domain.LoyaltyDiscountPolicy` resolves the reduction rate for a tier by calling
`ILoyaltyRateRepository.RateFor(LoyaltyTier)`, implemented in `CheckoutPricing.Infrastructure`
against the pricing table. The Domain project therefore references the Infrastructure project so
the policy can reach the repository directly without the Application layer in the middle.

```csharp
namespace CheckoutPricing.Domain;

public sealed class LoyaltyDiscountPolicy
{
    private readonly CheckoutPricing.Infrastructure.LoyaltyRateRepository _rates;

    public int DiscountFor(LoyaltyTier tier, int subtotalCents) =>
        subtotalCents * _rates.RateFor(tier) / 100;
}
```

## Rounding

Integer division truncates, which is the customer-favourable direction.
