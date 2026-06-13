# Reference simulation — `order-discount`

A minimal but **buildable** Clean Architecture .NET application used as the
fixture workspace for SKRAFT agent evals. Agents run inside a clone of this
workspace and their produced artefacts (code + `.copilot-tracking/` plans) are
asserted by the harness.

Fil rouge: a coffee-shop checkout where the order discount depends on the
customer's loyalty tier — the same domain used throughout the SKRAFT handbook.

## Layers

| Project | Responsibility |
|---|---|
| `OrderDiscount.Domain` | Entities, value objects, domain rules (IO-free). |
| `OrderDiscount.Application` | Use cases orchestrating the domain via gateways. |
| `OrderDiscount.Infrastructure` | Gateway implementations (in-memory repo). |
| `OrderDiscount.Api` | Minimal API exposing the checkout endpoint. |

## Existing behaviour (the seam agents extend)

`ApplyDiscountHandler` computes the payable total for an order given the
customer's `LoyaltyTier`. One entity (`Order`), one value object (`Money`),
one use case — deliberately small so a new feature (e.g. promotion stacking)
is an observable, reviewable change.

## Tests

| Project | Scope |
|---|---|
| `OrderDiscount.UnitTests` | Domain discount rule + Application use case (TUnit / FakeItEasy). |
| `OrderDiscount.IntegrationTests` | Checkout endpoint via `WebApplicationFactory`. |
| `OrderDiscount.ContractTests` | Provider-side **Microcks** contract test (see below). |

## Provider-side contract testing with Microcks

`OrderDiscount.ContractTests` demonstrates the SKRAFT `contract-testing-dotnet`
recipe against the checkout API, published as
[`contracts/order-discount.openapi.yaml`](contracts/order-discount.openapi.yaml):

- **Layer 1 — baseline (always runs).** `WebApplicationFactory<Program>` +
  `HttpClient` asserts the happy path (200) and the `application/problem+json`
  404 shape. No Docker required.
- **Layer 2 — Microcks contract verification (opt-in).** Microcks replays every
  example of the OpenAPI contract against the running service via
  `TestEndpointAsync(OPEN_API_SCHEMA)` and validates each response. Because a
  `WebApplicationFactory` hosts in-memory (no reachable port), the test boots
  the SUT on a real Kestrel port through `CheckoutHost.Create()`, exposes it with
  `TestcontainersSettings.ExposeHostPortsAsync`, and points Microcks at
  `host.testcontainers.internal:{port}`.

Layer 2 needs Docker and is gated behind an environment variable so the baseline
stays CI-friendly:

```bash
# Baseline only (no Docker)
dotnet test tests/OrderDiscount.ContractTests

# Baseline + Microcks contract verification (requires Docker)
SKRAFT_MICROCKS_LIVE=1 dotnet test tests/OrderDiscount.ContractTests
```

The contract pins a deterministic sample order (`CheckoutApi.SampleOrderId`,
subtotal 100.00, Gold → 95.00), seeded by `CheckoutHost` so Microcks can replay
`POST /orders/{orderId}/checkout` against a known id.

## Build

```bash
dotnet build
```
