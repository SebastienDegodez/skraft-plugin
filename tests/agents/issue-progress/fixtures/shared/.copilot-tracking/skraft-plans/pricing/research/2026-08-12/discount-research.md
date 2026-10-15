<!-- markdownlint-disable-file -->
# Research — discount

## Question

How should a loyalty tier reduce the checkout total without breaking the integer-cents
money model (ADR-001)?

## Findings

1. The basket subtotal is already carried as integer cents (`docs/adr/decisions-index.md`, ADR-001).
2. The tier is known at checkout through `LoyaltyTier` (`src/CheckoutPricing.Domain/LoyaltyTier.cs`).
3. Percentages applied to cents produce fractions; the refined scope requires rounding in the
   customer's favour (`plans/2026-08-12/stories-m1.md`).

## Recommendation

Apply a per-tier percentage to the subtotal in the Domain and floor the charged amount to a
whole cent. Keep promotional codes out of this story.
