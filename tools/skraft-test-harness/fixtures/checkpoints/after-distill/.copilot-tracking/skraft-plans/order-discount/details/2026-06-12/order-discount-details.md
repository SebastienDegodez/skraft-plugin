<!-- markdownlint-disable-file -->
# DISTILL — Test plan: promotion stacking

**Phase:** DISTILL
**Date:** 2026-06-12

## Coverage matrix

| Behaviour | Layer | Test kind |
|---|---|---|
| Loyalty-only total unchanged (no promotion) | Domain | unit |
| Loyalty + active promotion combine additively | Domain | unit |
| Combined rate clamped to cap | Domain | unit |
| Inactive promotion ignored | Domain | unit |
| Use case forwards promotion to the order | Application | unit (fake repo) |
| Checkout endpoint applies combined discount | Api | integration |

## Walking skeleton

Start at the API boundary (`POST /checkout` with promo params) and drive inward
to the `DiscountPolicy.CombinedRate` rule. The cap case is the discriminating
scenario — a naive implementation forgets to clamp.

## Implementation order

1. Domain `Promotion` + `DiscountPolicy.CombinedRate` (RED→GREEN).
2. `Order.PayableTotal(tier, promotion)` overload.
3. `ApplyDiscountRequest` optional promotion + handler wiring.
4. API query parameters + endpoint.
