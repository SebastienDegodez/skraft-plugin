<!-- markdownlint-disable-file -->
---
adr: 1
title: Promotion stacking via a downstream client + capped DiscountPolicy
status: Accepted
chosen: capped DiscountPolicy + IPromotionsGateway downstream client
decision: >
  Promotion stacking is computed by a DiscountPolicy domain service that clamps the
  combined loyalty + promotion rate to a configurable cap, with the external promotion
  fetched through an IPromotionsGateway downstream client.
supersedes: null
date: 2026-06-14
ratified_by: Solution Architect (DESIGN) 2026-06-14
---

# ADR-001 — Promotion stacking via a downstream client + capped DiscountPolicy

**Status:** Accepted
**Date:** 2026-06-14
**Phase:** DESIGN

## Context

The checkout already applies the loyalty discount in `Order.PayableTotal`. The
active store promotion comes from the **external Promotions API**. The combined
rate must be capped at 20%, and the external dependency must be isolated and
tested with mocks (never the real service).

## Decision

- Introduce a `Promotion` value object (rate + active flag) and a `DiscountPolicy`
  domain service that combines the loyalty rate and the promotion rate, then
  clamps the combined rate to a configurable cap (default 0.20):
  `min(loyalty + promo, cap)`.
- Introduce an Application gateway `IPromotionsGateway` and an Infrastructure
  `HttpPromotionsClient` that calls `GET /promotions/active`. The base URL is
  configuration-driven so tests can point it at a Microcks mock.
- `Order.PayableTotal` is overloaded to accept an optional `Promotion`; the
  existing overload delegates with "no promotion" to preserve behaviour.

## Testing decision (Microcks, dual usage)

- **Mock (consumer-side):** integration tests mock the Promotions API with a
  Microcks container seeded from `contracts/promotions-api.yaml`; the SUT's
  `HttpPromotionsClient` base URL points at the mock endpoint.
- **Contract testing (provider-side):** the checkout API is verified against
  `contracts/order-discount-checkout-api.yaml` with a Microcks provider test
  (`TestEndpointAsync(OPEN_API_SCHEMA)`) against the running service.

## Consequences

- Positive: rule stays in the Domain; downstream isolated; cap testable; both
  Microcks usages enforced.
- Negative: one value object, one domain service, one gateway + client.
- Supersedes: none.
