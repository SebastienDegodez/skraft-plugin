namespace Checkout.Domain;

public sealed record Basket(string CustomerId, int CustomerAge, decimal Total);
