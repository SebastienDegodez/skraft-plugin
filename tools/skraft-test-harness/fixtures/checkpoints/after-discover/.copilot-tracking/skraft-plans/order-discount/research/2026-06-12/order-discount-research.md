<!-- markdownlint-disable-file -->
# DISCOVER — Triage & Sprint Proposal: order-discount

## Source

Issue #42 — "Stack an active store promotion on top of the loyalty discount at checkout."

## Triage

| Field | Value |
|---|---|
| Type | feature |
| Priority | P2 |
| Effort | M (medium) |
| Duplicate of | none |
| Area | checkout / pricing |

## Problem statement

Today `ApplyDiscountHandler` applies only the loyalty-tier discount. Marketing
wants a time-boxed store promotion (e.g. "-15% happy hour") to combine with the
tier discount, with a guardrail so the combined discount never exceeds a cap.

## Evidence (existing seam)

- `OrderDiscount.Domain/Order.cs::PayableTotal(LoyaltyTier)` — the single rule
  that would change.
- `OrderDiscount.Application/ApplyDiscountHandler.cs` — the use case to extend.

## Sprint proposal

1. Refine the promotion-stacking story (DISCUSS).
2. Model promotion as a value object + combination rule (DESIGN).
3. Distil acceptance scenarios for cap and ordering (DISTILL).
4. Implement outside-in with mutation gate (DELIVER).

## Routing

- Entry point: from-issue
- Depth tier: comprehensive
- Difficulty: medium
