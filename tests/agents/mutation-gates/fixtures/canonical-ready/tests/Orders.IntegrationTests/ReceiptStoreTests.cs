using Orders.Infrastructure;

namespace Orders.IntegrationTests;

public static class ReceiptStoreTests
{
    public static bool AdapterFormatsReceipt() => new OrderReceiptStore().Save(90m) == "receipt:90.00";
}