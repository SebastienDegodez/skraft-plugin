<!-- markdownlint-disable-file -->

# AC draft — ST-101

## Story
As a user, I want to implement PricingController so that validation works.

## Acceptance criteria
1. Given an underage driver, when checkout is priced, then the API returns HTTP 200.
2. Given invalid input, when checkout is priced, then `DiscountRepository` is called with the payload.

## Domain examples
- driver age 17

## Technical notes
- Keep current controller shape.
