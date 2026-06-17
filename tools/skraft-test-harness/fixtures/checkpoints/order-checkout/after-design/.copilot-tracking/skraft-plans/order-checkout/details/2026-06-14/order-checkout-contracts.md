<!-- markdownlint-disable-file -->
# DESIGN — Interface contracts: order checkout

**Phase:** DESIGN
**Date:** 2026-06-14

## Domain seam

```csharp
public enum LoyaltyTier { Green, Gold, Platinum }

public static class LoyaltyTierExtensions
{
    public static decimal DiscountRate(this LoyaltyTier tier); // 0.00 / 0.05 / 0.10
}

public readonly record struct Money
{
    public decimal Amount { get; }      // non-negative
    public Money MultiplyBy(decimal factor);
}

public sealed class Order
{
    public Order(Guid id);
    public void AddLine(Money price);
    public Money Subtotal();
    public Money PayableTotal(LoyaltyTier tier);   // subtotal − subtotal*rate
}
```

## Application seam

```csharp
public interface IOrderRepository { Order? FindById(Guid orderId); }

public sealed record ApplyDiscountRequest(Guid OrderId, LoyaltyTier Tier);
public sealed record ApplyDiscountResult(Guid OrderId, decimal PayableTotal);

public sealed class ApplyDiscountHandler
{
    ApplyDiscountResult Handle(ApplyDiscountRequest request); // throws when not found
}
```

## API contract

`POST /orders/{orderId}/checkout?tier=Gold`
→ `200 application/json` `{ orderId, payableTotal }`
→ `404 application/problem+json` when the order is unknown.
