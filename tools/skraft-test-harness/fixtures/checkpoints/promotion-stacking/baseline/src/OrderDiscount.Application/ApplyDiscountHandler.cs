using OrderDiscount.Domain;

namespace OrderDiscount.Application;

/// <summary>Request to compute the payable total of an order for a customer tier.</summary>
public sealed record ApplyDiscountRequest(Guid OrderId, LoyaltyTier Tier);

/// <summary>Result carrying the discounted payable total.</summary>
public sealed record ApplyDiscountResult(Guid OrderId, decimal PayableTotal);

/// <summary>
/// Use case: apply the loyalty-tier discount to an existing order and return
/// the payable total. Orchestrates the domain via <see cref="IOrderRepository"/>;
/// the discount rule itself stays in the domain.
/// </summary>
public sealed class ApplyDiscountHandler
{
    private readonly IOrderRepository _orders;

    public ApplyDiscountHandler(IOrderRepository orders)
    {
        _orders = orders ?? throw new ArgumentNullException(nameof(orders));
    }

    public ApplyDiscountResult Handle(ApplyDiscountRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var order = _orders.FindById(request.OrderId)
            ?? throw new InvalidOperationException($"Order '{request.OrderId}' was not found.");

        var payable = order.PayableTotal(request.Tier);
        return new ApplyDiscountResult(order.Id, payable.Amount);
    }
}
