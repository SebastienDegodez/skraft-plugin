<!-- markdownlint-disable-file -->
# Approved implementation plan — checkout pricing quote

## Dispatch context

- Story: `discount`
- Project slug: `pricing`
- Status: approved for DELIVER
- Scenarios, in delivery order: S1 to S14 (`features/discount.feature`)

## Solution shape

This is a .NET 10 Clean Architecture solution. Production projects live under
`src/`: Domain has no project dependency; Application depends only on Domain;
Infrastructure depends on Application; API composes Application and Infrastructure.
Exactly two test projects live under `tests/`: `CheckoutPricing.UnitTest` targets
Domain + Application and `CheckoutPricing.IntegrationTest` owns architecture and outer
layer tests.

All amounts are integer cents. Percentages round down to the cent.

## Boundaries

Every scenario enters through one of these signatures; keep them exactly.

- `CalculateLoyaltyDiscount.Handle(CalculateLoyaltyDiscountQuery)` with
  `CalculateLoyaltyDiscountQuery(int SubtotalCents, LoyaltyTier LoyaltyTier, string? PromoCode = null)`,
  returning `LoyaltyDiscountQuote(int SubtotalCents, int DiscountCents, int TotalCents, LoyaltyTier LoyaltyTier)`.
- `CalculateShippingFee.Handle(CalculateShippingFeeQuery)` with
  `CalculateShippingFeeQuery(int PayableTotalCents, LoyaltyTier LoyaltyTier, bool Express = false)`,
  returning the fee in cents as `int` (S11 to S13).
- `QuoteCheckout.Handle(QuoteCheckoutQuery)` with
  `QuoteCheckoutQuery(int SubtotalCents, LoyaltyTier LoyaltyTier, string? PromoCode, bool Express)`,
  returning `CheckoutQuote(int PayableCents, int ShippingCents, int TotalCents)` (S14).
- `LoyaltyTier` already holds `Platinum`.

## Rules, by scenario

| Scenario | Rule |
|---|---|
| S1 | Loyalty rate: Bronze 5 %, Silver 10 %, Gold 15 % |
| S2 | The loyalty part is capped at 2 000 cents |
| S3 | A subtotal under 3 000 cents gets no loyalty part |
| S4 | `WELCOME5` adds 500 cents after the loyalty part |
| S5 | Cap and minimum apply to the loyalty part only |
| S6 | Promo codes compare case-insensitively |
| S7 | `SUMMER10` adds 10 % of the subtotal minus the loyalty part, at most 1 500 cents |
| S8 | Any other code is ignored |
| S9 | Platinum rate 20 % |
| S10 | The discount never exceeds the subtotal |
| S11 | Standard shipping 490 cents under 5 000 cents payable, 0 from 5 000 |
| S12 | Standard shipping is 0 for Gold and Platinum |
| S13 | Express shipping 990 cents, 0 for Platinum |
| S14 | Checkout total = payable total of the discount quote + shipping fee on that payable total |

## Test plan

| Scenario | Layer | Boundary | Doubles | Domain unit test |
|---|---|---|---|---|
| S1 | Application (UnitTest) | `CalculateLoyaltyDiscount` | none | Yes — Extraction Reason: `combinatorial_economy`, rate × subtotal grid (1, 7, 100, 10 000 cents × tiers) behind a pure Domain policy |
| S2–S10 | Application (UnitTest) | `CalculateLoyaltyDiscount` | none | No |
| S11–S13 | Application (UnitTest) | `CalculateShippingFee` | none | No |
| S14 | Application (UnitTest) | `QuoteCheckout` | none | No |

Each scenario's acceptance test lives in `tests/CheckoutPricing.UnitTest/` as one test whose
rows copy the scenario's examples in cents, its name starting with its scenario id (`S4_…`). The acceptance
tests of S1 to S14 and the boundary stubs they compile against are committed RED in
`test(discount): acceptance tests S1–S14`: `LoyaltyDiscount/DiscountTests.cs` (S1–S3, S9, S10),
`LoyaltyDiscount/PromoCodeAcceptanceTests.cs` (S4–S8), `Shipping/ShippingFeeAcceptanceTests.cs`
(S11–S13), `Checkout/QuoteCheckoutAcceptanceTests.cs` (S14). Do not edit them.

## Stack and verification

- Build command: `dotnet build CheckoutPricing.slnx --no-restore`.
- Test command: `dotnet test CheckoutPricing.slnx --no-restore`.
- NetArchTest.Rules architecture tests are in `CheckoutPricing.IntegrationTest`.
- NuGet restore completes before agent execution. Do not add or restore packages and do
  not use the network.
- Negative subtotals, unknown tiers, persistence and HTTP transport are out of scope.
- Load the .NET quality-gate adapter during COMMIT & VERIFY.
