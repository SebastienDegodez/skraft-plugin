using Checkout.Domain;

namespace Checkout.Application;

public interface ICustomerTiers
{
    string TierOf(string customerId);
}

public sealed class QuoteOrder(ICustomerTiers tiers)
{
    public decimal Execute(string customerId, decimal amount) =>
        LoyaltyDiscount.Apply(tiers.TierOf(customerId), amount);
}
