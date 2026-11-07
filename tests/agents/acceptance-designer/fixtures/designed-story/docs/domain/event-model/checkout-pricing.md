<!-- markdownlint-disable-file -->
# Event model — checkout-pricing

## Slice: discount

| Step | Kind | Name | Fields |
|---|---|---|---|
| Trigger | Query | `CalculateLoyaltyDiscount` | `SubtotalCents: whole cents`, `LoyaltyTier: LoyaltyTier` |
| Outcome | Read Model | `LoyaltyDiscountQuote` | `SubtotalCents: whole cents`, `DiscountCents: whole cents`, `TotalCents: whole cents`, `LoyaltyTier: LoyaltyTier` |

Observed: `LoyaltyDiscountQuote.TotalCents`.

`CalculateLoyaltyDiscount` is a pure read: it raises no Domain Event. Its handler,
`CheckoutPricing.Application.CalculateLoyaltyDiscount.Handle`, is the only use case the outer loop
drives. `LoyaltyDiscountQuote.TotalCents` is what the customer is charged: the observable the
acceptance criteria talk about.

```mermaid
timeline
    title discount
    section Command
        —
    section Event
        —
    section Read Model
        LoyaltyDiscountQuote : CalculateLoyaltyDiscount
```
