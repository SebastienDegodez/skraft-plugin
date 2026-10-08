using PaymentAuthorization.Domain.Authorization;
using PaymentAuthorization.Domain.Shared;

namespace PaymentAuthorization.Application.Authorization;

/// <summary>Authorizes one payment and keeps a receipt of what the provider answered.</summary>
public sealed class AuthorizePayment(IPaymentGateway gateway, IReceiptStore receipts)
{
    public async Task<AuthorizationOutcome> HandleAsync(string reference, Money amount, CancellationToken cancellationToken = default)
    {
        var outcome = await gateway.AuthorizeAsync(reference, amount, cancellationToken);
        await receipts.SaveAsync(reference, $"{amount.Currency} {amount.Amount} -> {outcome}", cancellationToken);
        return outcome;
    }
}
