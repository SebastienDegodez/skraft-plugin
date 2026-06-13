<!-- markdownlint-disable-file -->
# DISTILL — Test plan: order checkout

**Phase:** DISTILL
**Date:** 2026-06-14

## Coverage matrix

| Behaviour | Layer | Test kind |
|---|---|---|
| Green tier pays the full subtotal | Domain | unit |
| Gold tier gets 5% off | Domain | unit |
| Platinum tier gets 10% off | Domain | unit |
| Use case forwards the tier to the order | Application | unit (fake repo) |
| Checkout endpoint returns the payable total | Api | integration |
| Unknown order returns 404 ProblemDetails | Api | integration |

## Walking skeleton

Start at the API boundary (`POST /checkout`) and drive inward to the
`Order.PayableTotal` rule. The 404 case is the discriminating boundary — a naive
implementation throws 500 instead of mapping ProblemDetails.

## Implementation order

1. Domain `Money` + `LoyaltyTier` + `Order.PayableTotal` (RED→GREEN).
2. `ApplyDiscountRequest`/`Result` + `ApplyDiscountHandler`.
3. `IOrderRepository` + in-memory adapter.
4. API endpoint + 404 ProblemDetails mapping.
