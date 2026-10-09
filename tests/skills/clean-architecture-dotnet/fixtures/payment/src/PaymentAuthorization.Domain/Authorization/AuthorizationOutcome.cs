namespace PaymentAuthorization.Domain.Authorization;

/// <summary>What the payment provider decided about one authorization request.</summary>
public enum AuthorizationOutcome
{
    Declined = 0,
    Approved = 1,
}
