namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// The results of evaluating a scenario's assertions, owning the
/// aggregated pass decision over its <see cref="AssertionResult"/> items.
/// </summary>
public sealed class AssertionResults
{
    private readonly IReadOnlyList<AssertionResult> _items;

    public AssertionResults(IReadOnlyList<AssertionResult> items)
    {
        _items = items ?? throw new ArgumentNullException(nameof(items));
    }

    public bool AreAllPassing() => _items.All(r => r.IsPass());

    public int PassCount() => _items.Count(r => r.IsPass());

    public int Count() => _items.Count;

    /// <summary>Provides every failing assertion's description to the caller.</summary>
    public void WithFailures(Action<string> use)
    {
        ArgumentNullException.ThrowIfNull(use);
        foreach (var result in _items.Where(r => !r.IsPass()))
            use(result.ToString());
    }
}
