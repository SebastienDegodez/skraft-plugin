using PaymentAuthorization.Application;
using PaymentAuthorization.Domain;

namespace PaymentAuthorization.UnitTest.AuthorizePayment;

public sealed class AuthorizePaymentTests
{
    [Fact]
    public async Task An_approved_payment_is_reported_as_approved()
    {
        var gateway = new StubPaymentGateway(AuthorizationOutcome.Approved);
        var receipts = new InMemoryReceiptStore();
        var handler = new Application.AuthorizePayment(gateway, receipts);

        var outcome = await handler.HandleAsync("ORD-1", new Money(42.50m, "eur"));

        Assert.Equal(AuthorizationOutcome.Approved, outcome);
    }

    [Fact]
    public async Task Every_attempt_leaves_a_receipt_behind()
    {
        var gateway = new StubPaymentGateway(AuthorizationOutcome.Declined);
        var receipts = new InMemoryReceiptStore();
        var handler = new Application.AuthorizePayment(gateway, receipts);

        await handler.HandleAsync("ORD-2", new Money(10m, "EUR"));

        Assert.Contains("ORD-2", receipts.Saved.Keys);
    }

    private sealed class StubPaymentGateway(AuthorizationOutcome outcome) : IPaymentGateway
    {
        public Task<AuthorizationOutcome> AuthorizeAsync(string reference, Money amount, CancellationToken cancellationToken)
            => Task.FromResult(outcome);
    }

    private sealed class InMemoryReceiptStore : IReceiptStore
    {
        public Dictionary<string, string> Saved { get; } = [];

        public Task SaveAsync(string reference, string body, CancellationToken cancellationToken)
        {
            Saved[reference] = body;
            return Task.CompletedTask;
        }
    }
}
