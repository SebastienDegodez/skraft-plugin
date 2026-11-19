<!-- markdownlint-disable-file -->
# Approved implementation plan — checkout pricing quote

## Dispatch context

- Story: `discount`
- Project slug: `pricing`
- Status: approved for DELIVER
- Scenarios, in delivery order: S1, S2, S3, S4, S5 (`docs/features/pricing/discount.feature`)

## Solution shape

This is a .NET 10 Clean Architecture solution. Production projects live under
`src/`: Domain has no project dependency; Application depends only on Domain;
Infrastructure depends on Application; API composes Application and Infrastructure.
Exactly two test projects live under `tests/`: `CheckoutPricing.UnitTest` targets
Domain + Application and `CheckoutPricing.IntegrationTest` owns architecture and outer
layer tests.

All amounts are integer cents. Percentages round down to the cent.

## Steps

### Step 1 — S1 tier discount

- Boundary: `CalculateLoyaltyDiscount.Handle(CalculateLoyaltyDiscountQuery)` returns
  `LoyaltyDiscountQuote(SubtotalCents, DiscountCents, TotalCents, LoyaltyTier)`.
- Acceptance test: `tests/CheckoutPricing.UnitTest/LoyaltyDiscount/DiscountTests.cs`.
- Rates: Bronze 5 %, Silver 10 %, Gold 15 %.

### Step 2 — S2 cap

- Same boundary. The loyalty part of the discount is capped at 2 000 cents.
- Acceptance test: `tests/CheckoutPricing.UnitTest/LoyaltyDiscount/DiscountCapTests.cs`.

### Step 3 — S3 minimum subtotal

- Same boundary. A subtotal under 3 000 cents gets no loyalty discount.
- Acceptance test: `tests/CheckoutPricing.UnitTest/LoyaltyDiscount/MinimumSubtotalTests.cs`.

### Step 4 — S4 promo code

- `CalculateLoyaltyDiscountQuery` carries a last optional parameter `string? PromoCode = null`.
- Acceptance test: `tests/CheckoutPricing.UnitTest/LoyaltyDiscount/PromoCodeTests.cs`.
- `WELCOME5` adds 500 cents to the discount after the loyalty part (cap and minimum
  apply to the loyalty part only). The discount never exceeds the subtotal.
- Any other code is ignored.

### Step 5 — S5 shipping fee

- Boundary: `CalculateShippingFee.Handle(CalculateShippingFeeQuery)` with
  `CalculateShippingFeeQuery(int PayableTotalCents, LoyaltyTier LoyaltyTier)`, returning
  the fee in cents as `int`.
- Acceptance test: `tests/CheckoutPricing.UnitTest/Shipping/ShippingFeeTests.cs`.
- Fee 490 cents under 5 000 cents payable, 0 from 5 000 cents; Gold always 0.

## Test plan

| Scenario | Layer | Boundary | Doubles | Domain unit test |
|---|---|---|---|---|
| S1 | Application (UnitTest) | `CalculateLoyaltyDiscount` | none | Yes — Extraction Reason: `combinatorial_economy`, rate × subtotal grid (1, 7, 100, 10 000 cents × 3 tiers) behind a pure Domain policy |
| S2 | Application (UnitTest) | `CalculateLoyaltyDiscount` | none | No |
| S3 | Application (UnitTest) | `CalculateLoyaltyDiscount` | none | No |
| S4 | Application (UnitTest) | `CalculateLoyaltyDiscount` | none | No |
| S5 | Application (UnitTest) | `CalculateShippingFee` | none | No |

DISTILL committed every scenario's acceptance test and the skeleton it calls; each compiles and
fails on its business assertion. Do not edit them.

## Stack and verification

- Stack markers: `CheckoutPricing.slnx`, `Directory.Packages.props`, and six `*.csproj` files.
- Build command: `dotnet build CheckoutPricing.slnx --no-restore`.
- Test command: `dotnet test CheckoutPricing.slnx --no-restore`.
- NetArchTest.Rules architecture tests are in `CheckoutPricing.IntegrationTest`.
- NuGet restore completes before agent execution. Do not add or restore packages and do
  not use the network.
- Negative subtotals, unknown tiers, persistence and HTTP transport are out of scope.
- The engine runs the quality gates, mutation included, after DELIVER.
