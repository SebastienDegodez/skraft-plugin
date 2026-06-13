<!-- markdownlint-disable-file -->
# DISCOVER — Triage & Sprint Proposal: order-checkout

## Source

Issue #42 — "Order checkout with loyalty discount."

## Triage

| Field | Value |
|---|---|
| Type | feature |
| Priority | P2 |
| Effort | M (medium) |
| Duplicate of | none |
| Area | checkout / pricing |

## Problem statement

The application is an empty Clean Architecture skeleton. We must build the order
checkout: when a customer checks out an order, the payable total reflects a
discount based on the customer's loyalty tier (Green 0%, Gold 5%, Platinum 10%).
The discount rule must live in the Domain layer, and an unknown order id must
return a 404 ProblemDetails.

## Evidence (the seam to populate)

- `OrderDiscount.Domain/` — empty, will hold the `Order` aggregate and the
  discount rule.
- `OrderDiscount.Application/` — will hold the checkout use case.
- `OrderDiscount.Api/` — will expose `POST /orders/{id}/checkout`.

## Sprint proposal

1. Refine the checkout story with acceptance criteria (DISCUSS).
2. Model the order + discount rule, record an ADR (DESIGN).
3. Distil acceptance scenarios per tier + the 404 case (DISTILL).
4. Implement outside-in with a mutation gate (DELIVER).

## Routing

- Entry point: from-issue
- Depth tier: comprehensive
- Difficulty: medium
