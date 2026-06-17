<!-- markdownlint-disable-file -->
# ADR-001 — Loyalty discount rule lives in the Order aggregate

**Status:** Accepted
**Date:** 2026-06-14
**Phase:** DESIGN

## Context

We are building the order checkout on an empty Clean Architecture skeleton. The
payable total depends on the customer's loyalty tier (Green 0%, Gold 5%,
Platinum 10%). The discount rule must not leak into the API/controller layer.

## Decision

Introduce an `Order` aggregate that owns its line totals and exposes
`PayableTotal(LoyaltyTier)`. The tier→rate mapping is a Domain concern
(`LoyaltyTier.DiscountRate()`), and `Money` is a value object guaranteeing a
non-negative single-currency amount. The Application use case
(`ApplyDiscountHandler`) only orchestrates: it resolves the order through an
`IOrderRepository` gateway and asks the aggregate for the payable total.

- Discount computation stays in the Domain.
- The API maps a missing order to a 404 ProblemDetails; the Domain never deals
  with HTTP.

## Consequences

- Positive: the rule is unit-testable without IO; the API stays thin.
- Negative: one aggregate + one value object + one gateway to maintain.
- Supersedes: none.
