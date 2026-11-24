<!-- markdownlint-disable-file -->
# Research: discount — loyalty tier, promo code and shipping in the checkout quote

## Scope and success criteria
- Scope: the fourteen acceptance criteria of story `discount` (loyalty discount, promo codes, shipping fee, checkout quote). Negative subtotals, persistence and HTTP transport are excluded by the story.
- Assumptions: amounts stay integer cents; percentages round down to the cent, as the criteria state.
- Success criteria:
  - DESIGN knows what already exists and can be reused.
  - DESIGN can choose where each pricing rule lives.

## Research executed
### File analysis
- #file:src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs
  - `CalculateLoyaltyDiscountQuery` and `LoyaltyDiscountQuote` exist (#file:src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs:5-11).
  - The use case `CalculateLoyaltyDiscount` returns a zero discount whatever the tier: no rule is implemented (#file:src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs:13-17).
- #file:src/CheckoutPricing.Domain/LoyaltyTier.cs
  - `LoyaltyTier` holds Bronze, Silver, Gold; Platinum is missing (#file:src/CheckoutPricing.Domain/LoyaltyTier.cs:3-8).
- #file:src/CheckoutPricing.Infrastructure/InfrastructureMarker.cs
  - The infrastructure project holds a marker type only: no repository, no gateway (#file:src/CheckoutPricing.Infrastructure/InfrastructureMarker.cs:1-3).
- #file:src/CheckoutPricing.Api/Program.cs
  - The host maps `/health` only; no pricing endpoint (#file:src/CheckoutPricing.Api/Program.cs:3).
- #file:docs/adr/adr-001-integer-cent-money.md
  - Accepted: every amount crossing a boundary is an integer number of cents (#file:docs/adr/adr-001-integer-cent-money.md:2-12).
### Code search / graph
- `Promo`, `Shipping`, `Quote` -> #file:src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs only: no promo code, shipping or checkout quote type exists.
- `ICommandBus`, `IQueryBus`, `IEventStore`, `Saga` -> no match.
### External research
- None needed: the story introduces no library and no external service.
### Project conventions
- .NET, nullable enabled, warnings as errors: #file:Directory.Build.props:1-6
- xUnit and NetArchTest, versions managed centrally: #file:Directory.Packages.props:1-10
- Stack, test framework, project layout, and the files that declare build/test commands: #file:CheckoutPricing.slnx, #file:skraft-config.json:8-12
- No Copilot instructions file, no `AGENTS.md`, no `CONTRIBUTING.md`.
### Existing tests
| Test file | Test name | Behaviour covered |
|---|---|---|
| #file:tests/CheckoutPricing.IntegrationTest/Architecture/ArchitectureTests.cs | DomainHasNoDependencyOnOuterLayers | the Domain depends on no outer layer |
| #file:tests/CheckoutPricing.IntegrationTest/Architecture/ArchitectureTests.cs | ApplicationDependsOnDomainButNotOuterLayers | the Application depends on the Domain only |
| #file:tests/CheckoutPricing.IntegrationTest/Architecture/ArchitectureTests.cs | InfrastructureHasNoDependencyOnApi | the Infrastructure does not depend on the host |

No test covers the use case the story modifies.

## Product and architecture context
None found: no architecture document, no PRD; the story and its acceptance criteria are the only source.

## Key discoveries
- One use case exists and is a stub; the two others the story needs (shipping fee, checkout quote) do not exist.
- Use cases are plain classes with a `Handle` method, called directly: no dispatch bus (#file:src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs:13-17).
- The story keeps no state between calls: every criterion computes a result from its inputs.
- The dependency direction between the four projects is already enforced by tests (#file:tests/CheckoutPricing.IntegrationTest/Architecture/ArchitectureTests.cs:8-56).

## Evaluated approaches
### Pricing rules as Domain policy, one use case per quote (recommended)
- The tier percentages, the cap, the minimum subtotal, the promo codes and the shipping fees are business rules: they sit in the Domain as pure policy, and three use cases (loyalty discount, shipping fee, checkout quote) orchestrate them.
- Evidence: the existing use case already has this shape (#file:src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs:13-17); the architecture tests already protect the Domain (#file:tests/CheckoutPricing.IntegrationTest/Architecture/ArchitectureTests.cs:8-56).
- Impact: Platinum joins `LoyaltyTier`; new value types for the promo code and the shipping option.
### Rules computed inside the use cases (rejected)
- The cap and the promo rules are needed by both the loyalty discount and the checkout quote: the rules would be written twice.
### Rules in the host (rejected)
- HTTP transport is out of scope, and the Domain would stay empty of the business policy it exists to hold (#file:src/CheckoutPricing.Api/Program.cs:3).

## Handoff to DESIGN
- Recommended approach: pricing rules as Domain policy, three use cases. Decisions DESIGN must ratify: where the promo code and shipping rules live; whether the checkout quote calls the two other use cases or the Domain policy directly.
- Existing aggregates, use cases, interfaces and structural patterns DESIGN reuses:
  - `CalculateLoyaltyDiscount`, its query and its quote -> #file:src/CheckoutPricing.Application/CalculateLoyaltyDiscount.cs
  - `LoyaltyTier` -> #file:src/CheckoutPricing.Domain/LoyaltyTier.cs
  - Dependency rules -> #file:tests/CheckoutPricing.IntegrationTest/Architecture/ArchitectureTests.cs
- Open questions that remain for the architect: none; the criteria give every amount and every rounding rule.
