<!-- markdownlint-disable-file -->
# Research: loyalty tier pricing

## Scope and success criteria
- Scope: pricing a basket for a returning customer by loyalty tier; promotional codes excluded.
- Success criteria:
  - The existing pricing entry point and its tests are known before design.

## Research executed
### File analysis
- src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs
  - `Handle` returns the subtotal unchanged (lines 13-17): no reduction is applied yet.
- src/CheckoutPricing.Domain/LoyaltyTier.cs
  - Bronze, Silver and Gold (lines 3-8).
### Project conventions
- .NET 10, xUnit, Clean Architecture: `src/CheckoutPricing.Domain`, `src/CheckoutPricing.Application`, `tests/CheckoutPricing.UnitTest`.
- Stack, test framework, project layout, and the files that declare build/test commands: CheckoutPricing.slnx, Directory.Packages.props, tests/CheckoutPricing.UnitTest/CheckoutPricing.UnitTest.csproj
### Existing tests
| Test file | Test name | Behaviour covered |
|---|---|---|
| tests/CheckoutPricing.UnitTest/Pricing/WholeCentPricingTests.cs | Bronze_customer_pricing_a_7_cent_basket_is_charged_7_cents | A Bronze customer pricing a 7-cent basket through `CalculateLoyaltyDiscount.Handle` is charged 7 cents |

## Key discoveries
- The entry point exists; the tier reduction does not.

## Handoff to DESIGN
- Recommended approach: keep `CalculateLoyaltyDiscount.Handle` as the boundary; the reduction is a Domain policy.
- Existing use cases DESIGN reuses: CalculateLoyaltyDiscount -> src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs
