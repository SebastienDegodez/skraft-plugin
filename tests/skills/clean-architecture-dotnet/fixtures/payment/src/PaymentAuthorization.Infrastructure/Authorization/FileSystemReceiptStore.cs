using PaymentAuthorization.Application.Authorization;

namespace PaymentAuthorization.Infrastructure.Authorization;

/// <summary>Keeps one receipt file per reference under a root directory.</summary>
public sealed class FileSystemReceiptStore(string rootDirectory) : IReceiptStore
{
    public async Task SaveAsync(string reference, string body, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(rootDirectory);
        var path = Path.Combine(rootDirectory, $"{reference}.txt");
        await File.WriteAllTextAsync(path, body, cancellationToken);
    }
}
