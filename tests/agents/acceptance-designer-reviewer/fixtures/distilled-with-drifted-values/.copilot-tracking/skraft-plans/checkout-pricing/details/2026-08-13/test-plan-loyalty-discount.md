<!-- markdownlint-disable-file -->
# Test plan — loyalty-discount

## Coverage matrix

| Criterion | Scenario | Level | Entry point | Observation |
|---|---|---|---|---|
| AC-1 Bronze | A loyalty tier reduces the basket subtotal | Application | CalculateLoyaltyDiscount.Handle | LoyaltyDiscountQuote.TotalCents |
| AC-2 Silver | A loyalty tier reduces the basket subtotal | Application | CalculateLoyaltyDiscount.Handle | LoyaltyDiscountQuote.TotalCents |
| AC-3 Gold | A loyalty tier reduces the basket subtotal | Application | CalculateLoyaltyDiscount.Handle | LoyaltyDiscountQuote.TotalCents |

Every acceptance criterion is covered by the outer acceptance test.
