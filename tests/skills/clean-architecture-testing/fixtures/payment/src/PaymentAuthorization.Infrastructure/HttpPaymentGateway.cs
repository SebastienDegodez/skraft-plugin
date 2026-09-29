using System.Net.Http.Json;
using System.Text.Json.Serialization;
using PaymentAuthorization.Application;
using PaymentAuthorization.Domain;

namespace PaymentAuthorization.Infrastructure;

/// <summary>
/// Talks to the provider's REST API: POST /v1/authorizations, and read back the decision.
/// The provider answers 200 with {"status":"approved"|"declined"} and 402 when it refuses
/// the request outright.
/// </summary>
public sealed class HttpPaymentGateway(HttpClient client) : IPaymentGateway
{
    public async Task<AuthorizationOutcome> AuthorizeAsync(string reference, Money amount, CancellationToken cancellationToken)
    {
        var request = new AuthorizationRequest(reference, amount.Amount, amount.Currency);
        using var response = await client.PostAsJsonAsync("/v1/authorizations", request, cancellationToken);

        if (response.StatusCode == System.Net.HttpStatusCode.PaymentRequired) return AuthorizationOutcome.Declined;
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<AuthorizationResponse>(cancellationToken);
        return body?.Status == "approved" ? AuthorizationOutcome.Approved : AuthorizationOutcome.Declined;
    }

    private sealed record AuthorizationRequest(
        [property: JsonPropertyName("reference")] string Reference,
        [property: JsonPropertyName("amount")] decimal Amount,
        [property: JsonPropertyName("currency")] string Currency);

    private sealed record AuthorizationResponse(
        [property: JsonPropertyName("status")] string Status);
}
