<!-- markdownlint-disable-file -->
---
description: "DISCUSS plan — order checkout with loyalty discount"
---
# DISCUSS — Refined Story: order checkout with loyalty discount

## User story

**As a** customer
**I want** my order's payable total to reflect my loyalty tier's discount at checkout
**so that** loyal customers are rewarded automatically without manual price overrides.

## INVEST check

- Independent: yes (single endpoint + domain rule)
- Negotiable: tier rates are parameters
- Valuable: rewards loyalty
- Estimable: M
- Small: one aggregate + one use case + one endpoint
- Testable: each tier and the 404 are observable

## Acceptance criteria

1. Given an order and a `Green` tier, when checkout is computed, then the payable
   total equals the subtotal (0% discount).
2. Given a `Gold` tier, then a 5% discount is applied.
3. Given a `Platinum` tier, then a 10% discount is applied.
4. Given an unknown order id, when checkout is requested, then the API returns
   404 with an `application/problem+json` body.

## Definition of Ready

- [x] Story format complete
- [x] Acceptance criteria enumerated
- [x] Seam identified (empty Domain/Application/Api skeleton)
- [x] Tier rates agreed (Green 0%, Gold 5%, Platinum 10%)
