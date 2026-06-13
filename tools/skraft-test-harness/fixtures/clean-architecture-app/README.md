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

## Build

```bash
dotnet build
```
