<!-- markdownlint-disable-file -->
# Acceptance criteria draft — loyalty-discount

## AC-1 — Bronze basket
Given a returning customer in the Bronze tier
When a basket subtotal of 10 000 cents is priced
Then the customer is charged 9 500 cents

## AC-2 — Silver basket
Given a returning customer in the Silver tier
When a basket subtotal of 10 000 cents is priced
Then the customer is charged 9 000 cents

## AC-3 — Gold basket
Given a returning customer in the Gold tier
When a basket subtotal of 10 000 cents is priced
Then the customer is charged 8 500 cents

## AC-4 — Rounding
Given any tier
When the computed reduction is not a whole number of cents
Then the customer is charged the amount rounded in the customer's favour

## Ubiquitous language
- **Loyalty tier** — the standing a returning customer has earned.
- **Subtotal** — the basket amount before any reduction.
- **Reduction** — the amount removed from the subtotal for a loyalty tier.
