namespace Checkout.Application;

/// <summary>
/// The port onto the DOWNSTREAM Eligibility API. This is what an integration test
/// has to replace: the checkout owns none of it, it only calls it.
/// </summary>
public interface IEligibilityClient
{
    Task<bool> IsEligibleAsync(int age, CancellationToken cancellationToken = default);
}
