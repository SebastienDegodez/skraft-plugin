# Checkout Pricing

A .NET Clean Architecture service that prices a checkout basket.

- `src/CheckoutPricing.Domain` — business policy, no outward dependency.
- `src/CheckoutPricing.Application` — use cases orchestrating the domain.
- `src/CheckoutPricing.Infrastructure` — implementations of what the application asks for.
- `src/CheckoutPricing.Api` — the HTTP host.
- `tests/CheckoutPricing.UnitTest`, `tests/CheckoutPricing.IntegrationTest` — the test projects.

The milestone story under `.copilot-tracking/skraft-plans/pricing/plans/`
describes the work that has not started yet.
