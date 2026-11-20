# CheckoutPricing throughput fixture, acceptance tests written

Same story, solution and plans as `software-engineer-throughput/fixtures/s14`, copied here so the
suite stands alone in any worktree. The spec seeds `s14`, then applies `s14-designed` as a second
commit, `test(discount): acceptance tests S1–S14`: what an acceptance-designer that writes every
acceptance test hands over.

## Fixture states

### `s14`

A copy of `software-engineer-throughput/fixtures/s14`. Keep both identical.

### `s14-designed`

- the acceptance test of every scenario, tagged `[Trait("Scenario", "Sk")]`, values in cents
  copied from the `.feature`: S1–S3, S9, S10 in `LoyaltyDiscount/DiscountTests.cs`, S4–S8 in
  `PromoCodeAcceptanceTests.cs`, S11–S13 in `Shipping/ShippingFeeAcceptanceTests.cs`, S14 in
  `Checkout/QuoteCheckoutAcceptanceTests.cs`;
- the boundary stubs they compile against, with no behaviour: `PromoCode`, `Platinum`,
  `CalculateShippingFee`, `QuoteCheckout`;
- the implementation plan, saying the tests are committed and not to be edited.

With no behaviour, S12 (free standard shipping for Gold and Platinum) and the 29.99 EUR row of S3
already pass at RED; every other scenario fails on its business assertion.
