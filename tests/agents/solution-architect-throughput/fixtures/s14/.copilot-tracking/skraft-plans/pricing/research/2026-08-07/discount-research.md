<!-- markdownlint-disable-file -->
# Research: discount — loyalty tier, promo code and shipping in the checkout quote

## Scope and success criteria
- Scope: the fourteen acceptance criteria of the `discount` story (loyalty discount, promo codes, shipping fee, checkout quote). Negative subtotals, persistence and HTTP transport are excluded by the story.
- Assumptions: amounts stay integer cents (ADR-001); percentages round down to the cent, as the criteria state.
- Success criteria:
  - DESIGN knows what already exists and can be reused.
  - DESIGN can choose where each pricing rule lives.

## Research executed
### File analysis
- src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs
  - `CalculateLoyaltyDiscountQuery(SubtotalCents, LoyaltyTier)` and `LoyaltyDiscountQuote(SubtotalCents, DiscountCents, TotalCents, LoyaltyTier)` exist (lines 5-11).
  - The use case `CalculateLoyaltyDiscount.Handle` returns a zero discount whatever the tier (lines 13-17): no rule is implemented.
- src/CheckoutPricing.Domain/LoyaltyTier.cs
  - `LoyaltyTier` holds Bronze, Silver, Gold (lines 3-8); Platinum is missing.
- src/CheckoutPricing.Infrastructure/InfrastructureMarker.cs
  - The infrastructure project holds a marker type only: no repository, no gateway.
- src/CheckoutPricing.Api/Program.cs
  - The host maps `/health` only (line 3); no pricing endpoint.
- tests/CheckoutPricing.IntegrationTest/Architecture/ArchitectureTests.cs
  - NetArchTest rules enforce the dependency direction between the four projects (lines 8-56).
- docs/adr/adr-001-integer-cent-money.md
  - Accepted: every amount crossing a boundary is an integer number of cents.
### Code search / graph
- `Promo`, `Shipping`, `Quote` -> only `LoyaltyDiscountQuote` in src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs; no promo code, shipping or checkout quote type exists.
- `ICommandBus`, `IQueryBus`, `IEventStore`, `Saga` -> no match (see details/2026-08-07/structural-scan.json).
### External research
- None needed: the story introduces no library or external service.
### Project conventions
- .NET, nullable enabled, warnings as errors: Directory.Build.props.
- xUnit and NetArchTest, versions managed centrally: Directory.Packages.props.
- Projects: `src/CheckoutPricing.{Domain,Application,Infrastructure,Api}`, `tests/CheckoutPricing.{UnitTest,IntegrationTest}`; solution file CheckoutPricing.slnx.
- Build and test: `dotnet build CheckoutPricing.slnx`, `dotnet test CheckoutPricing.slnx`.
- No `.github/copilot-instructions.md` in the repository.

## Key discoveries
- One use case exists and is a stub; the two others the story needs (shipping fee, checkout quote) do not exist.
- Use cases are plain classes with a `Handle` method, called directly: no dispatch bus.
- The story needs no state kept between calls: every criterion computes a result from its inputs.
- No unit test exists yet; the unit test project is empty.

## Evaluated approaches
### Pricing rules as Domain policy, one use case per quote (recommended)
- The tier percentages, the cap, the minimum subtotal, the promo codes and the shipping fees are business rules: they sit in the Domain as pure policy, and three use cases (loyalty discount, shipping fee, checkout quote) orchestrate them.
- Evidence: the existing use case already follows this shape (src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs:13-17); the architecture tests already protect the Domain (tests/CheckoutPricing.IntegrationTest/Architecture/ArchitectureTests.cs:8-56).
- Impact: Platinum is added to `LoyaltyTier`; new value types for the promo code and the shipping option.
### Rules computed inside the use cases (rejected)
- Shorter at first, but the cap and the promo rules are needed by both the loyalty discount and the checkout quote: the rules would be duplicated across use cases.
### Rules in the Api layer (rejected)
- HTTP transport is out of scope and the Domain would stay empty of the business policy it exists to hold.

## Handoff to DESIGN
- Recommended approach: pricing rules as Domain policy, three use cases. Decisions DESIGN must ratify: where the promo code and shipping rules live; whether the checkout quote calls the two other use cases or the Domain policy directly.
- Existing aggregates, use cases, interfaces and structural patterns DESIGN reuses:
  - `CalculateLoyaltyDiscount`, its query and its quote -> src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs
  - `LoyaltyTier` -> src/CheckoutPricing.Domain/LoyaltyTier.cs
  - Dependency rules -> tests/CheckoutPricing.IntegrationTest/Architecture/ArchitectureTests.cs
- Open questions that remain for the architect: none on the product side; the criteria give every amount and every rounding rule.
