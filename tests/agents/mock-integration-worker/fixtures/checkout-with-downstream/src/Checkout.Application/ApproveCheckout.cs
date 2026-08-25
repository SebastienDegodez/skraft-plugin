using Checkout.Domain;

namespace Checkout.Application;

public sealed class ApproveCheckout(IEligibilityClient eligibility)
{
    public async Task<bool> ForAsync(Basket basket, CancellationToken cancellationToken = default)
        => await eligibility.IsEligibleAsync(basket.CustomerAge, cancellationToken);
}
