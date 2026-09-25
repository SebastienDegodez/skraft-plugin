<!-- markdownlint-disable-file -->

# Context map — loyalty pricing

**Date:** 2026-08-13

| Context | Owns | Relationship |
|---|---|---|
| Checkout | The payable total charged to the member | Customer of Loyalty |
| Loyalty | Member tiers as held internally | Supplier to Checkout |
| Partner Portal | Tiers for members acquired through partners | Upstream of Loyalty |

Loyalty is a conformist to the Partner Portal: it takes the published tier shape
as given and does not negotiate it.

## Language

`member`, `tier`, `order subtotal`, `payable total`. The word `customer` is not
used in this slice; the lexicon settled on `member`.
