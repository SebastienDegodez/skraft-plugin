<!-- markdownlint-disable-file -->
---
description: "DISCUSS plan — promotion stacking on order checkout"
---
# DISCUSS — Refined Story: promotion stacking

## User story

**As a** marketing manager
**I want** an active store promotion (from the external Promotions API) to combine
with the customer's loyalty-tier discount
**so that** time-boxed campaigns reward loyal customers, within a safe cap.

## INVEST check

- Independent: yes (extends the discount rule + adds one downstream client)
- Negotiable: cap value is a parameter
- Valuable: enables campaigns
- Estimable: M
- Small: one downstream client + one rule + one use-case change
- Testable: cap, stacking, and the mocked downstream are observable

## Acceptance criteria

1. Given an active promotion from the Promotions API, when checkout is computed,
   then the payable total reflects **both** discounts.
2. The combined discount rate is **capped at 20%**; beyond the cap the payable
   total uses the cap, never a negative price.
3. Given no active promotion, the payable total equals the loyalty-only result
   (no regression).

## Test constraints (carried to DELIVER)

- The Promotions API is **mocked with Microcks** in integration tests.
- The checkout API is verified with a **Microcks provider contract test**.

## Definition of Ready

- [x] Story format complete
- [x] Acceptance criteria enumerated
- [x] Seam identified (`Order.PayableTotal` + new Promotions client)
- [x] Cap policy agreed (20%) and Microcks dual-usage agreed
