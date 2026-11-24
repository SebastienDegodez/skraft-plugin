<!-- markdownlint-disable-file -->
# Approved implementation plan — loyalty discount

## Dispatch context

- Story: `discount`
- Project slug: `pricing`
- Status: approved for DELIVER

## Solution shape

Two components. `checkout-pricing` (root `.`) is a .NET 10 Clean Architecture solution:
`src/` holds Domain, Application, Infrastructure and API; `tests/` holds
`CheckoutPricing.UnitTest` and `CheckoutPricing.IntegrationTest`. `loyalty-rates` (root
`rates`) is the class library `LoyaltyRates` that owns the loyalty rate of each tier;
`CheckoutPricing.Application` references it.

## Active behavior slice

Scenario 1, component `checkout-pricing`. `CalculateLoyaltyDiscount.Handle` already applies
`LoyaltyRateTable.PercentFor(tier)` to the subtotal, rounding down to the cent. The approved
rates are Bronze 5 %, Silver 10 %, Gold 15 %; `LoyaltyRateTable` has no Gold rate yet. The
acceptance test `tests/CheckoutPricing.UnitTest/LoyaltyDiscount/DiscountTests.cs` fails on its
Gold row only. Do not edit it.

## Stack and verification

- Build command: `dotnet build CheckoutPricing.slnx --no-restore`.
- Test command: `dotnet test CheckoutPricing.slnx --no-restore`.
- NuGet restore completes before agent execution. Do not add or restore packages and do
  not use the network.
