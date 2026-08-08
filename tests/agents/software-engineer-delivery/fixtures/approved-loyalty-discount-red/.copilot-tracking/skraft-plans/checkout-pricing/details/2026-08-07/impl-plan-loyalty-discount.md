<!-- markdownlint-disable-file -->
# Approved implementation plan — loyalty discount

## Dispatch context

- Story: `loyalty-discount`
- Project slug: `checkout-pricing`
- Depth tier: `standard`
- Difficulty: `medium`
- Status: approved for DELIVER

## Solution shape

This is a .NET 10 Clean Architecture solution. Production projects live under
`src/`: Domain has no project dependency; Application depends only on Domain;
Infrastructure depends on Application; API composes Application and Infrastructure.
Exactly two test projects live under `tests/`: `CheckoutPricing.UnitTest` targets
Domain + Application and `CheckoutPricing.IntegrationTest` owns architecture and outer
layer tests.

## Active behavior slice

Implement only the loyalty-discount scenario outline from the approved feature. The application
boundary is `CalculateLoyaltyDiscount.Handle`. The existing acceptance test at
`tests/CheckoutPricing.UnitTest/LoyaltyDiscount/CalculateLoyaltyDiscountAcceptanceTests.cs`
is the approved outer test. It compiles and currently fails on the business assertion.
Do not edit its inputs or expected values.

Drive one parameterized Domain-policy RED in the same UnitTest project before changing
production code. Test the approved percentage matrix (Bronze 5%, Silver 10%, Gold 15%)
against subtotals 1, 7, 100, and 10,000 cents, with integer-cent discounts rounded down.
This 12-case grid opens Mandate 4 gate `combinatorial_economy`; keep the three
representative business examples at the Application boundary and put the sweep behind a
pure Domain policy signature. Negative subtotals, unknown tiers, persistence, and HTTP
transport remain undecided and out of scope.

## Stack and verification

- Stack markers: `CheckoutPricing.slnx`, `Directory.Packages.props`, and six `*.csproj` files.
- Build command: `dotnet build CheckoutPricing.slnx --no-restore`.
- Test command: `dotnet test CheckoutPricing.slnx --no-restore`.
- NetArchTest.Rules architecture tests are in `CheckoutPricing.IntegrationTest`.
- NuGet restore completes before agent execution. Do not add or restore packages and do
  not use the network.
- Load the .NET quality-gate adapter during COMMIT & VERIFY. If Stryker is unavailable,
  capture that failed gate and return an honest blocker; never invent a mutation score.