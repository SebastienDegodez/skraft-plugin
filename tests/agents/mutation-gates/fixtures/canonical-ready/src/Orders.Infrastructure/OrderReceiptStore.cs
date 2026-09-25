namespace Orders.Infrastructure;

public sealed class OrderReceiptStore
{
    public string Save(decimal total) => $"receipt:{total:0.00}";
}