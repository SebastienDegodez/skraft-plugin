using System.Collections.Concurrent;
using OrderDiscount.Application;
using OrderDiscount.Domain;

namespace OrderDiscount.Infrastructure;

/// <summary>In-memory <see cref="IOrderRepository"/> adapter for the sample.</summary>
public sealed class InMemoryOrderRepository : IOrderRepository
{
    private readonly ConcurrentDictionary<Guid, Order> _orders = new();

    public void Save(Order order) => _orders[order.Id] = order;

    public Order? FindById(Guid orderId) =>
        _orders.TryGetValue(orderId, out var order) ? order : null;
}
