<!-- markdownlint-disable-file -->

# Diagrams — loyalty tier

**Date:** 2026-08-13

## How a tier reaches pricing

```mermaid
sequenceDiagram
    participant PP as Partner Portal
    participant GW as LoyaltyTierGateway
    participant UC as CalculatePayableTotal
    participant PO as LoyaltyDiscountPolicy

    PP->>GW: tier payload, exactly as published
    GW->>UC: tier
    UC->>PO: subtotalCents, tier
    PO-->>UC: payable total
    UC-->>GW: payable total
```

## Where the tier comes from

The tier is published by the Partner Portal, a system the loyalty team does not
own. `LoyaltyTierGateway` reads the published payload and passes the tier straight
through: it maps field names only, and adds no step of its own between the Partner
Portal and `CalculatePayableTotal`.

## Deployment

One process. The gateway is a library call, not a network hop, in this slice.
