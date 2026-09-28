<!-- markdownlint-disable-file -->
# Event model — discount

| Step | Command | Event | Read model |
|---|---|---|---|
| 1 | PriceBasket(customerId, subtotalCents) | BasketPriced(customerId, tier, chargedCents) | CheckoutTotal |
| 2 | — | LoyaltyReductionApplied(tier, reductionCents) | CheckoutTotal |

Tier reductions: Bronze 5 %, Silver 10 %, Gold 15 %. `chargedCents` is floored to a whole cent.
