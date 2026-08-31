using PaymentAuthorization.Infrastructure;

namespace PaymentAuthorization.IntegrationTest.ReceiptStore;

public sealed class FileSystemReceiptStoreTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"receipts-{Guid.NewGuid():N}");

    [Fact]
    public async Task A_saved_receipt_can_be_read_back_from_disk()
    {
        var store = new FileSystemReceiptStore(root);

        await store.SaveAsync("ORD-7", "EUR 12 -> Approved", CancellationToken.None);

        var written = await File.ReadAllTextAsync(Path.Combine(root, "ORD-7.txt"));
        Assert.Equal("EUR 12 -> Approved", written);
    }

    public void Dispose()
    {
        if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    }
}
