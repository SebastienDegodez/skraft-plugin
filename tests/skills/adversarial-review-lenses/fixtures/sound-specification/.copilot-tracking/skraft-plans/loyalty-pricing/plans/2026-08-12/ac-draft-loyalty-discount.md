<!-- markdownlint-disable-file -->

# Acceptance criteria — loyalty discount

**Date:** 2026-08-12
**Story:** As a member, I want my loyalty tier reflected in what I pay, so that
staying with us is worth it.

All amounts are whole cents. Every example below was agreed with the business on
2026-08-11 and is reproduced unchanged in `features/loyalty-discount.feature`.

| ID | Acceptance criterion | Agreed example |
|---|---|---|
| AC-1 | A Standard member pays the full order subtotal | subtotal 10000 cents, payable 10000 cents |
| AC-2 | A Gold member pays ninety-five percent of the order subtotal | subtotal 10000 cents, payable 9500 cents |
| AC-3 | When ninety-five percent of the subtotal is not a whole cent, the remaining part cent goes to the member | subtotal 4999 cents, payable 4749 cents |
| AC-4 | A member whose Gold tier has lapsed pays as a Standard member | subtotal 10000 cents, payable 10000 cents |

## Out of scope for this story

- Tier promotion and demotion rules.
- Combining a loyalty discount with a promotional code.
- Refunds and partial cancellations.
