<!-- markdownlint-disable-file -->
# DISCOVER — Triage & Sprint Proposal: promotion-stacking

## Source

Issue #57 — "Stack an active store promotion on top of the loyalty discount at checkout."

## Triage

| Field | Value |
|---|---|
| Type | feature |
| Priority | P2 |
| Effort | M (medium-hard) |
| Duplicate of | none |
| Area | checkout / pricing / external integration |

## Problem statement

The order checkout already applies the loyalty-tier discount
(`Order.PayableTotal(LoyaltyTier)`). Marketing wants an active store promotion to
combine with it. The active promotion is **not local**: it is fetched from the
**external Promotions API** (`GET /promotions/active`, contract in
`contracts/promotions-api.yaml`). The combined discount rate must be **capped**
at 20%.

## Integration constraints (drive DELIVER)

- Integration tests must **mock** the external Promotions API with Microcks
  (seeded from its contract) — never call the real service.
- Our checkout API must be verified against its OpenAPI contract with a Microcks
  **provider contract test**.

## Evidence (the seam)

- `OrderDiscount.Domain/Order.cs::PayableTotal(LoyaltyTier)` — the rule to extend.
- `OrderDiscount.Application/ApplyDiscountHandler.cs` — the use case to extend.
- new downstream client for the Promotions API (to be created in DELIVER).

## Routing

- Entry point: from-issue
- Depth tier: comprehensive
- Difficulty: medium-hard (external dependency + dual Microcks usage)
