namespace PaymentAuthorization.Application.Authorization;

/// <summary>Outbound store keeping one receipt per authorization attempt.</summary>
public interface IReceiptStore
{
    Task SaveAsync(string reference, string body, CancellationToken cancellationToken);
}
