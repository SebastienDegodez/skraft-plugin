<!-- markdownlint-disable-file -->
# Acceptance criteria — loyalty-discount

## AC-1 — Bronze basket
Given a returning customer in the Bronze tier
When a basket subtotal of 10000 cents is priced
Then the customer is charged 9500 cents

## AC-2 — Silver basket
Given a returning customer in the Silver tier
When a basket subtotal of 10000 cents is priced
Then the customer is charged 9000 cents

## AC-3 — Gold basket
Given a returning customer in the Gold tier
When a basket subtotal of 10000 cents is priced
Then the customer is charged 8500 cents

## AC-4 — Reduction lands on a whole cent in the customer's favour
Given a returning customer in the Bronze tier
When a basket subtotal of 7 cents is priced
Then the customer is charged 7 cents
