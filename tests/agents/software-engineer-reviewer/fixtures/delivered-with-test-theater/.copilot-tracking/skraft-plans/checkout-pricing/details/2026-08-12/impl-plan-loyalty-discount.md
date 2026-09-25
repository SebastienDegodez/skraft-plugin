<!-- markdownlint-disable-file -->
# Approved implementation plan — loyalty discount

## Dispatch context

- Story: `loyalty-discount`
- Project slug: `checkout-pricing`
- Status: approved for DELIVER

## Solution shape

.NET Clean Architecture. `src/CheckoutPricing.Domain` carries the pricing policy and
depends on nothing. `src/CheckoutPricing.Application` orchestrates the use case.
`tests/CheckoutPricing.UnitTest` targets Domain and Application.

## Active behavior slice

Bronze 5%, Silver 10%, Gold 15% off the basket subtotal, expressed in whole cents and
always rounded in the customer's favour. The rounding rule is the reason the 7-cent
Bronze example exists: a percentage of 7 cents is not a whole cent.

## Verification contract

The evidence log at `evidence/{date}/qg-{story}.json` must record the commands that were
actually run, their exit codes and the mutation score they produced.
