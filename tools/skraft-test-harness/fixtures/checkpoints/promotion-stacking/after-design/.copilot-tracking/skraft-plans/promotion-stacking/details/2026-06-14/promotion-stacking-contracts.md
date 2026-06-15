<!-- markdownlint-disable-file -->
# DESIGN — Interface contracts: promotion stacking

**Phase:** DESIGN
**Date:** 2026-06-14

## Domain seam

```csharp
public readonly record struct Promotion(decimal Rate, bool IsActive)
{
    public static Promotion None => new(0m, false);
}

public static class DiscountPolicy
{
    public const decimal DefaultCap = 0.20m;
    public static decimal CombinedRate(LoyaltyTier tier, Promotion promotion, decimal cap = DefaultCap);
}

public Money PayableTotal(LoyaltyTier tier, Promotion promotion); // Order overload
```

## Application + Infrastructure seam (downstream)

```csharp
public interface IPromotionsGateway { Promotion GetActivePromotion(); }

// Infrastructure: HttpPromotionsClient -> GET {PromotionsApi:BaseUrl}/promotions/active
// Base URL is configuration-driven so tests point it at the Microcks mock.
```

## External contract to mock

`contracts/promotions-api.yaml` — `GET /promotions/active` → `Promotion`.
Mocked with Microcks (seeded from this contract) in integration tests.

## Provider contract to verify

`contracts/order-discount-checkout-api.yaml` — checkout API, verified with a
Microcks provider contract test (`OPEN_API_SCHEMA`).
