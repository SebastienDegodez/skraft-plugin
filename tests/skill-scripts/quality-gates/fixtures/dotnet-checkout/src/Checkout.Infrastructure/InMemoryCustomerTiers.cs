using Checkout.Application;

namespace Checkout.Infrastructure;

public sealed class InMemoryCustomerTiers(IReadOnlyDictionary<string, string> tiers) : ICustomerTiers
{
    public string TierOf(string customerId) =>
        tiers.TryGetValue(customerId, out var tier) ? tier : "standard";
}
