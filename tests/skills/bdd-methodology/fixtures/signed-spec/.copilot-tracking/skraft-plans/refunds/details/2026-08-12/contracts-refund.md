<!-- markdownlint-disable-file -->
# Contracts — refund-request

## Application boundary

`Returns.Application.RequestRefund.Handle` is the entry point for a refund request. It is the
only boundary the team drives the refund behaviour from.

```csharp
RequestRefundCommand(Guid PurchaseId, DateOnly RequestedOn)
RefundDecision(Guid PurchaseId, RefundOutcome Outcome, decimal AmountRefunded, string Reason)
```

`Returns.Application.GetPurchaseHistory.Handle` reports what has already happened to a purchase.

```csharp
PurchaseHistoryQuery(Guid PurchaseId)
PurchaseHistory(Guid PurchaseId, decimal PricePaid, DateOnly BoughtOn, bool AlreadyRefunded)
```

## Observable outcomes

`RefundDecision.Outcome`, `RefundDecision.AmountRefunded` and `RefundDecision.Reason` carry
everything the business talks about. `PurchaseHistory.AlreadyRefunded` records that a purchase
has been refunded once.

## Layering

`Returns.Domain` depends on nothing. `Returns.Application` depends on Domain only. The return
period and the refunded-once rule are business policy and belong in Domain.
