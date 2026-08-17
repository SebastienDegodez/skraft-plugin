<!-- markdownlint-disable-file -->

# Change log — loyalty discount

**Date:** 2026-08-14
**Slice:** loyalty discount for members
**Author:** delivery pair

## What shipped

- `LoyaltyDiscountPolicy` holds the discount rule for members.
- `CalculatePayableTotal` exposes the entry point checkout calls.

## Coverage

Every agreed scenario in `features/loyalty-discount.feature` is covered by an
acceptance test that goes through `CalculatePayableTotal`. The suite is green.

## Follow-up

None. The slice is ready for the next one to build on.
