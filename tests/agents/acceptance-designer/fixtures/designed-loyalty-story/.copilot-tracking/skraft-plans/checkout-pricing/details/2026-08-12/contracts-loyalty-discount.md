<!-- markdownlint-disable-file -->
# Contracts — loyalty-discount

## Application boundary

`CheckoutPricing.Application.CalculateLoyaltyDiscount.Handle` is the entry point for pricing a
basket. It is the only boundary the outer loop drives.

```csharp
CalculateLoyaltyDiscountQuery(int SubtotalCents, LoyaltyTier LoyaltyTier)
LoyaltyDiscountQuote(int SubtotalCents, int DiscountCents, int TotalCents, LoyaltyTier LoyaltyTier)
```

## Observable outcome

`LoyaltyDiscountQuote.TotalCents` is what the customer is charged. It is the observable the
acceptance criteria talk about.

## Layering

`CheckoutPricing.Domain` depends on nothing. `CheckoutPricing.Application` depends on Domain only.
The pricing rule is business policy and belongs in Domain.
