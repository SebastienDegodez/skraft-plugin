<!-- markdownlint-disable-file -->
# DESIGN — Interface contracts: promotion stacking

**Phase:** DESIGN
**Date:** 2026-06-12

## Domain seam

```csharp
public readonly record struct Promotion(decimal Rate, bool IsActive)
{
    public static Promotion None => new(0m, false);
}

public static class DiscountPolicy
{
    public const decimal DefaultCap = 0.20m;

    // Additive then capped: min(loyalty + promo, cap)
    public static decimal CombinedRate(LoyaltyTier tier, Promotion promotion, decimal cap = DefaultCap);
}

// Order gains an overload; the existing one delegates with Promotion.None.
public Money PayableTotal(LoyaltyTier tier, Promotion promotion);
```

## Application seam

`ApplyDiscountRequest` gains an optional `Promotion` (defaults to `None`), so the
existing checkout path is unchanged when no promotion is supplied.

## API contract

`POST /orders/{id}/checkout?tier=Gold&promoRate=0.15&promoActive=true`
returns `{ orderId, payableTotal }` with the combined, capped discount applied.
