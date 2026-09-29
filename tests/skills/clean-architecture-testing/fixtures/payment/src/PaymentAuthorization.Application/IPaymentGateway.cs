using PaymentAuthorization.Domain;

namespace PaymentAuthorization.Application;

/// <summary>Outbound gateway to the payment provider.</summary>
public interface IPaymentGateway
{
    Task<AuthorizationOutcome> AuthorizeAsync(string reference, Money amount, CancellationToken cancellationToken);
}
