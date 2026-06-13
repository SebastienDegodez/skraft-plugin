using OrderDiscount.Domain;

namespace OrderDiscount.Application;

/// <summary>Gateway to the order store. Implemented by Infrastructure.</summary>
public interface IOrderRepository
{
    Order? FindById(Guid orderId);
}
