<!-- markdownlint-disable-file -->
# Test plan — loyalty discount

## Scenarios

| # | Scenario | Component | Tags |
|---|---|---|---|
| S1 | Member receives the loyalty discount of their tier | checkout-pricing | @happy-path |
| S2 | A large Silver cart gets the Silver rate on its whole subtotal | checkout-pricing | @happy-path |

Walking skeleton exemption: library

## Tests

| Scenario | Layer | Boundary | Doubles | Priority |
|---|---|---|---|---|
| S1 | Application (UnitTest) | `CalculateLoyaltyDiscount` | none | must |
| S2 | Application (UnitTest) | `CalculateLoyaltyDiscount` | none | must |
