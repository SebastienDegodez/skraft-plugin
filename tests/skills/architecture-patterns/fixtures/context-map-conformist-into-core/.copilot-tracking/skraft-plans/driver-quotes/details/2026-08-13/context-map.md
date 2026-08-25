# Context map — driver quotes

Committed at the end of Phase 5. Each arrow already carries the pattern that was
agreed, and each context already carries its subdomain class. Nothing below is
open for re-negotiation; what is open is whether the arrows are sound.

## Contexts

| Context | Subdomain class | Note |
|---|---|---|
| `QuotePricing` | Core | Owns the tariff rules the whole product is sold on. Changes most sprints. |
| `PartnerPortal` | Generic | Third-party portal. We consume it; we do not own its schema. |
| `Reporting` | Supporting | Reads pricing outcomes for the monthly statement. |

## Arrows

| # | Upstream | Downstream | Pattern |
|---|---|---|---|
| A1 | `PartnerPortal` | `QuotePricing` | Conformist |
| A2 | `QuotePricing` | `Reporting` | Open Host Service + Published Language |

### A1 — as agreed

`QuotePricing` consumes the partner portal's driver record and adopts the
portal's model as-is: the portal's field names and its notion of a "driver
category" are used directly inside the pricing rules.

### A2 — as agreed

`Reporting` reads a published pricing outcome through a versioned contract owned
by `QuotePricing`.
