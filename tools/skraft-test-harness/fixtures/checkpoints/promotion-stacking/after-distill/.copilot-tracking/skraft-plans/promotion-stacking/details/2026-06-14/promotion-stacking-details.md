<!-- markdownlint-disable-file -->
# DISTILL — Test plan: promotion stacking

**Phase:** DISTILL
**Date:** 2026-06-14

## Coverage matrix

| Behaviour | Layer | Test kind |
|---|---|---|
| Loyalty-only total when no promotion | Domain | unit |
| Loyalty + active promotion combine additively | Domain | unit |
| Combined rate clamped to the 20% cap | Domain | unit |
| Use case fetches the promotion via the gateway | Application | unit (fake gateway) |
| Checkout uses the Promotions mock end-to-end | Api | integration (Microcks **mock**) |
| Checkout API conforms to its OpenAPI contract | Api | contract (Microcks **provider**) |

## Microcks usage (dual)

- **Mock:** `MicrocksContainerEnsemble` seeded from `contracts/promotions-api.yaml`;
  the SUT's `HttpPromotionsClient` base URL → `GetRestMockEndpoint("Promotions API", "1.0.0")`.
- **Contract test:** boot the checkout on a real Kestrel port, expose it, and run
  `TestEndpointAsync(TestRequest { OPEN_API_SCHEMA })` against it.

## Walking skeleton

Start at the checkout endpoint with the Promotions mock wired, drive inward to
`DiscountPolicy.CombinedRate`. The cap case is the discriminating scenario.
