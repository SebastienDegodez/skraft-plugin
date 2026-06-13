<!-- markdownlint-disable-file -->
# ADR-001 — Promotion stacking via a PromotionPolicy value object

**Status:** Accepted
**Date:** 2026-06-12
**Phase:** DESIGN

## Context

The loyalty discount lives in `Order.PayableTotal(LoyaltyTier)`. Marketing needs
a store promotion to combine with it, capped so the combined rate never exceeds a
guardrail. The rule must stay in the domain (not a controller or the API layer).

## Decision

Introduce a `Promotion` value object (rate + active flag) and a `DiscountPolicy`
domain service that combines the loyalty rate and the promotion rate, then clamps
the combined rate to a configurable cap (default 0.20). `Order.PayableTotal` is
overloaded to accept an optional `Promotion`; the existing single-argument
overload delegates with "no promotion" to preserve behaviour.

- Combination is **additive then capped**: `min(loyalty + promo, cap)`.
- Cap is a domain constant with an overridable parameter.
- No negative totals: clamped rate is in `[0, cap]`.

## Consequences

- Positive: rule stays in the domain; existing callers unaffected; cap testable.
- Negative: one more value object and a policy seam to maintain.
- Supersedes: none.
