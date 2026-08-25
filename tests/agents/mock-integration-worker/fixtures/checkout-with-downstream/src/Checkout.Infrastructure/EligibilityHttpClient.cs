using System.Net.Http.Json;

using Checkout.Application;

namespace Checkout.Infrastructure;

/// <summary>
/// Typed client onto the downstream Eligibility API. Its base address comes from
/// configuration key <c>EligibilityApi:BaseUrl</c>, which is the seam a test host
/// repoints at whatever stands in for the real dependency.
/// </summary>
public sealed class EligibilityHttpClient(HttpClient http) : IEligibilityClient
{
    public async Task<bool> IsEligibleAsync(int age, CancellationToken cancellationToken = default)
    {
        var decision = await http.GetFromJsonAsync<EligibilityResponse>(
            $"/eligibility/{age}", cancellationToken);
        return decision?.Eligible ?? false;
    }

    private sealed record EligibilityResponse(int Age, bool Eligible);
}
