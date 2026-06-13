<!-- markdownlint-disable-file -->
---
description: "DISCUSS plan — promotion stacking on order discount"
---
# DISCUSS — Refined Story: promotion stacking

## User story

**As a** marketing manager
**I want** an active store promotion to combine with the customer's loyalty discount
**so that** time-boxed campaigns reward loyal customers without manual price overrides.

## INVEST check

- Independent: yes (extends the existing discount rule only)
- Negotiable: cap value is a parameter
- Valuable: enables campaigns
- Estimable: M
- Small: one rule + one use-case change
- Testable: cap and ordering are observable

## Acceptance criteria

1. Given an order and a loyalty tier, when an active promotion applies, then the
   payable total reflects **both** discounts.
2. The combined discount rate is **capped** (default 20%); beyond the cap the
   payable total uses the cap, never a negative price.
3. Given no active promotion, the payable total equals the loyalty-only result
   (no regression).

## Definition of Ready

- [x] Story format complete
- [x] Acceptance criteria enumerated
- [x] Seam identified (`Order.PayableTotal`)
- [x] Cap policy agreed (20% default, configurable)
