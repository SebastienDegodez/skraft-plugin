using PaymentAuthorization.Domain.Authorization;
using PaymentAuthorization.Domain.Shared;

namespace PaymentAuthorization.Application.Authorization;

/// <summary>Outbound gateway to the payment provider.</summary>
public interface IPaymentGateway
{
    Task<AuthorizationOutcome> AuthorizeAsync(string reference, Money amount, CancellationToken cancellationToken);
}
