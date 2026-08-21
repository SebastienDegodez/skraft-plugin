# Context map — driver quotes

Committed at the end of Phase 5. Each arrow already carries the pattern that was
agreed, and each context already carries its subdomain class.

## Contexts

| Context | Subdomain class | Note |
|---|---|---|
| `QuotePricing` | Core | Owns the tariff rules the whole product is sold on. Changes most sprints. |
| `PartnerPortal` | Generic | Third-party portal. We consume it; we do not own its schema. |
| `Reporting` | Supporting | Reads pricing outcomes for the monthly statement. |

## Arrows

| # | Upstream | Downstream | Pattern |
|---|---|---|---|
| A1 | `PartnerPortal` | `QuotePricing` | Anticorruption Layer |
| A2 | `QuotePricing` | `Reporting` | Open Host Service + Published Language |

### A1 — as agreed

`QuotePricing` translates the partner portal's driver record into its own model
at the boundary. The portal's field names and its notion of a "driver category"
stop at the translator; the pricing rules only ever see our own vocabulary.

### A2 — as agreed

`Reporting` reads a published pricing outcome through a versioned contract owned
by `QuotePricing`.
