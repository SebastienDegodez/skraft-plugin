namespace Toolbox;

/// <summary>
/// Shared helpers for sending work to downstream services in chunks.
/// </summary>
public static class BatchSplitter
{
    /// <summary>
    /// Splits <paramref name="items"/> into batches of at most
    /// <paramref name="size"/> items, keeping the original order.
    /// Splitting 1000 items into batches of 300 gives 300, 300, 300 and 100.
    /// </summary>
    public static IReadOnlyList<IReadOnlyList<T>> SplitIntoBatches<T>(IReadOnlyList<T> items, int size)
    {
        ArgumentNullException.ThrowIfNull(items);
        ArgumentOutOfRangeException.ThrowIfLessThan(size, 1);

        var batches = new List<IReadOnlyList<T>>();

        for (var start = 0; start + size <= items.Count; start += size)
        {
            var batch = new List<T>(size);

            for (var offset = 0; offset < size; offset++)
            {
                batch.Add(items[start + offset]);
            }

            batches.Add(batch);
        }

        return batches;
    }
}
